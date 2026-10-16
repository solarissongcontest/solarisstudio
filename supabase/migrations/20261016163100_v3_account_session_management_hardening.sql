begin;

-- Follow-up hardening for the P42 session contract. Keep raw Supabase session
-- ids private even through the existing public fresh-auth status helper, and use
-- an explicit target alias in the revocation tombstone UPSERT.

create or replace function public.studio2_r3_auth_status(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $status$
declare
  v_session_id uuid;
  v_evidence jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();
  v_evidence := private.studio2_auth_freshness_evidence(p_max_age_seconds);

  if v_evidence ->> 'sessionId' is distinct from v_session_id::text then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  return v_evidence - 'sessionId';
end
$status$;

revoke all on function public.studio2_r3_auth_status(integer)
  from public, anon;
grant execute on function public.studio2_r3_auth_status(integer)
  to authenticated, service_role;

create or replace function public.v3_revoke_session(
  p_session_handle text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $revoke$
declare
  v_actor uuid := auth.uid();
  v_current_session uuid;
  v_current_handle text;
  v_target_session uuid;
  v_tombstone public.studio2_account_session_revocations;
  v_existing public.studio2_operation_receipts;
  v_evidence jsonb;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
  v_handle text := lower(btrim(coalesce(p_session_handle, '')));
begin
  v_current_session := private.v3_require_active_auth_session();
  v_current_handle := private.v3_session_handle(v_actor, v_current_session);

  if v_handle !~ '^[0-9a-f]{64}$'
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_handle = v_current_handle then
    raise exception using
      errcode = '42501',
      message = 'AUTHORIZATION',
      hint = 'Use the canonical current-session sign-out flow.';
  end if;

  -- Lost-response reconciliation for the exact already-succeeded operation does
  -- not require a second fresh-auth ceremony.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'account.session.revoke'
    and receipt.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return coalesce(v_existing.result, '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;

  select session_row.id
  into v_target_session
  from auth.sessions session_row
  where session_row.user_id = v_actor
    and private.v3_session_handle(v_actor, session_row.id) = v_handle
    and session_row.id <> v_current_session
  for update;

  if v_target_session is null then
    select revocation.*
    into v_tombstone
    from public.studio2_account_session_revocations revocation
    where revocation.user_id = v_actor
      and revocation.session_handle = v_handle
    limit 1;

    if v_tombstone.auth_session_id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;
  end if;

  if v_target_session is not null then
    v_evidence := private.studio2_require_fresh_auth(300);
  else
    v_evidence := private.studio2_auth_freshness_evidence(300);
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'account.session.revoke',
    'R3',
    jsonb_build_object('sessionHandle', v_handle),
    jsonb_build_object('sessionHandle', v_handle)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'correlationId', v_claim ->> 'correlationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_target_session is null then
    v_result := jsonb_build_object(
      'ok', true,
      'sessionHandle', v_handle,
      'alreadyRevoked', true,
      'revokedAt', v_tombstone.revoked_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  else
    insert into public.studio2_account_session_revocations as existing_revocation (
      auth_session_id,
      user_id,
      session_handle,
      operation_id,
      revoked_by_session_id,
      revoked_at,
      reason
    )
    values (
      v_target_session,
      v_actor,
      v_handle,
      v_canonical_operation_id,
      v_current_session,
      now(),
      'user_revoked'
    )
    on conflict (auth_session_id) do update set
      operation_id = coalesce(existing_revocation.operation_id, excluded.operation_id),
      revoked_by_session_id = excluded.revoked_by_session_id,
      revoked_at = least(existing_revocation.revoked_at, excluded.revoked_at);

    delete from auth.sessions session_row
    where session_row.id = v_target_session
      and session_row.user_id = v_actor;

    select revocation.*
    into v_tombstone
    from public.studio2_account_session_revocations revocation
    where revocation.auth_session_id = v_target_session;

    v_result := jsonb_build_object(
      'ok', true,
      'sessionHandle', v_handle,
      'alreadyRevoked', false,
      'revokedAt', v_tombstone.revoked_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  end if;

  update public.studio2_operation_receipts
  set
    actor_session_id = v_current_session::text,
    auth_freshness_evidence = v_evidence,
    updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$revoke$;

revoke all on function public.v3_revoke_session(text, uuid, text)
  from public, anon;
grant execute on function public.v3_revoke_session(text, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
