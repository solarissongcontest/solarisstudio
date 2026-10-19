begin;

-- V3 release blocker #1167: country-account credential replacement is an R3
-- identity operation. The browser may review intent, but the server owns actor,
-- capability, fresh-auth evidence, exact target scope, idempotency, audit,
-- session revocation and the authoritative receipt.

create or replace function public.v3_begin_country_account_credential_replacement(
  p_target_user_id uuid,
  p_expected_country_id uuid,
  p_expected_account_updated_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_credential_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $begin_replace$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_proof text := lower(btrim(coalesce(p_credential_proof, '')));
  v_account public.country_accounts%rowtype;
  v_country_name text;
  v_existing public.studio2_operation_receipts%rowtype;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_evidence jsonb;
  v_claim jsonb;
  v_canonical_operation_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_target_user_id is null
     or p_expected_country_id is null
     or p_expected_account_updated_at is null
     or p_operation_id is null
     or v_key is null
     or v_reason is null
     or char_length(v_reason) not between 8 and 500
     or v_proof !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using
      errcode = '42501',
      message = 'AUTHORIZATION',
      hint = 'The delegation.manage capability is required for country-account credential replacement.';
  end if;

  v_scope := jsonb_build_object(
    'targetUserId', p_target_user_id,
    'countryId', p_expected_country_id,
    'expectedAccountUpdatedAt', p_expected_account_updated_at,
    'reason', v_reason,
    'sessionPolicy', 'revoke_all'
  );
  v_request := jsonb_build_object(
    'targetUserId', p_target_user_id,
    'countryId', p_expected_country_id,
    'expectedAccountUpdatedAt', p_expected_account_updated_at,
    'credentialProof', v_proof,
    'reason', v_reason,
    'sessionPolicy', 'revoke_all'
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'account.country_credential.replace',
    'R3',
    v_scope,
    v_request
  );

  -- A successful exact replay is reconciliation, not a new sensitive action.
  -- Do not force a second reauthentication ceremony after the mutation already
  -- committed, but still require the caller to retain the same capability and
  -- exact semantic request identity.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'account.country_credential.replace'
    and receipt.idempotency_key = v_key
  limit 1;

  if v_existing.operation_id is not null then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_existing.status = 'succeeded' then
      return coalesce(v_existing.result, '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    if v_existing.status in ('failed', 'uncertain') then
      raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
    end if;
  end if;

  v_evidence := private.studio2_require_fresh_auth(300);

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = p_target_user_id
  for share;

  if v_account.user_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_account.country_id is distinct from p_expected_country_id
     or v_account.updated_at is distinct from p_expected_account_updated_at then
    raise exception using
      errcode = 'P0001',
      message = 'STATE_CHANGED',
      hint = 'The country account changed after review. Reload it and review the current target before retrying.';
  end if;

  select country.name
  into v_country_name
  from public.countries country
  where country.id = v_account.country_id;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    p_operation_id,
    'account.country_credential.replace',
    'R3',
    v_scope,
    v_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false)
     and v_claim ->> 'status' = 'succeeded' then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;
  if coalesce((v_claim ->> 'replayed')::boolean, false)
     and v_claim ->> 'status' in ('failed', 'uncertain') then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  update public.studio2_operation_receipts
  set
    actor_session_id = v_evidence ->> 'sessionId',
    auth_freshness_evidence = v_evidence,
    updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return jsonb_build_object(
    'ok', true,
    'ready', true,
    'replayed', coalesce((v_claim ->> 'replayed')::boolean, false),
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'targetUserId', v_account.user_id,
    'countryId', v_account.country_id,
    'countryName', coalesce(v_country_name, v_account.country_id::text),
    'accountUpdatedAt', v_account.updated_at,
    'sessionPolicy', 'revoke_all'
  );
end
$begin_replace$;

revoke all on function public.v3_begin_country_account_credential_replacement(
  uuid, uuid, timestamptz, uuid, text, text, text
) from public, anon;
grant execute on function public.v3_begin_country_account_credential_replacement(
  uuid, uuid, timestamptz, uuid, text, text, text
) to authenticated, service_role;

comment on function public.v3_begin_country_account_credential_replacement(
  uuid, uuid, timestamptz, uuid, text, text, text
) is
  'R3 preflight/claim for Organizer country-account credential replacement. Requires delegation.manage, fresh auth and exact reviewed target state. Password material is never accepted by PostgreSQL.';

create or replace function public.v3_finalize_country_account_credential_replacement(
  p_operation_id uuid,
  p_target_user_id uuid,
  p_country_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $finalize_replace$
declare
  v_receipt public.studio2_operation_receipts%rowtype;
  v_account public.country_accounts%rowtype;
  v_revoked_sessions integer := 0;
  v_result jsonb;
  v_event_version bigint;
begin
  if p_operation_id is null or p_target_user_id is null or p_country_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_receipt.command is distinct from 'account.country_credential.replace'
     or v_receipt.risk_class is distinct from 'R3'
     or v_receipt.scope ->> 'targetUserId' is distinct from p_target_user_id::text
     or v_receipt.scope ->> 'countryId' is distinct from p_country_id::text then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;
  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = p_target_user_id
  for share;

  if v_account.user_id is null
     or v_account.country_id is distinct from p_country_id
     or v_account.updated_at::text is distinct from v_receipt.scope ->> 'expectedAccountUpdatedAt' then
    raise exception using
      errcode = 'P0001',
      message = 'STATE_CHANGED',
      hint = 'The reviewed country account target changed before credential finalization.';
  end if;

  -- Explicit policy: credential replacement revokes every existing target
  -- session. Auth password update may already have invalidated some sessions;
  -- this authoritative cleanup makes the Solaris contract deterministic.
  with deleted as (
    delete from auth.sessions session_row
    where session_row.user_id = p_target_user_id
    returning session_row.id
  )
  select count(*)::integer into v_revoked_sessions from deleted;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'riskClass', 'R3',
    'targetUserId', p_target_user_id,
    'countryId', p_country_id,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'sessionPolicy', 'revoke_all',
    'revokedSessionCount', v_revoked_sessions,
    'completedAt', now(),
    'replayed', false
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    country_id,
    before_data,
    after_data
  ) values (
    v_receipt.actor_id,
    'country_account_credential_replaced',
    'country_accounts',
    p_target_user_id::text,
    p_country_id,
    jsonb_build_object(
      'targetUserId', p_target_user_id,
      'countryId', p_country_id,
      'accountUpdatedAt', v_account.updated_at,
      'sessionPolicy', 'revoke_all'
    ),
    jsonb_build_object(
      'operationId', p_operation_id,
      'receiptId', p_operation_id,
      'credentialChanged', true,
      'reason', v_receipt.scope ->> 'reason',
      'sessionPolicy', 'revoke_all',
      'revokedSessionCount', v_revoked_sessions,
      'actorSessionId', v_receipt.actor_session_id,
      'authFreshness', v_receipt.auth_freshness_evidence
    )
  );

  v_event_version := greatest(
    1,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
  perform private.v3_emit_domain_event(
    'account.country_credential_replaced',
    'country_account',
    p_target_user_id::text,
    v_event_version,
    p_operation_id,
    null,
    null,
    jsonb_build_object(
      'countryId', p_country_id,
      'sessionPolicy', 'revoke_all',
      'revokedSessionCount', v_revoked_sessions
    ),
    1,
    array[]::text[]
  );

  update public.studio2_operation_receipts
  set
    status = 'succeeded',
    result = v_result,
    completed_at = now(),
    error_code = null,
    error_metadata = null,
    updated_at = now()
  where operation_id = p_operation_id;

  return v_result;
end
$finalize_replace$;

revoke all on function public.v3_finalize_country_account_credential_replacement(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.v3_finalize_country_account_credential_replacement(
  uuid, uuid, uuid
) to service_role;

comment on function public.v3_finalize_country_account_credential_replacement(
  uuid, uuid, uuid
) is
  'Service-only finalizer after Auth has accepted the replacement credential. Revokes target sessions, writes immutable audit/event evidence and completes the canonical R3 receipt.';

notify pgrst, 'reload schema';

commit;
