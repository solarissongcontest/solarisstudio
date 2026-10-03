begin;

-- Organisation OS V5 R3 fresh-authentication enforcement.
--
-- Supabase JWTs expose signed session_id and AMR entries with authentication
-- method timestamps. Token refresh is not accepted as fresh authentication.

alter table public.studio2_operation_receipts
  add column if not exists actor_session_id text,
  add column if not exists auth_freshness_evidence jsonb;

create or replace function private.studio2_auth_freshness_evidence(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $freshness$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_session_id text := nullif(v_claims ->> 'session_id', '');
  v_method text;
  v_authenticated_at timestamptz;
  v_max_age integer := greatest(30, least(coalesce(p_max_age_seconds, 300), 900));
  v_age_seconds integer;
begin
  select
    entry ->> 'method',
    to_timestamp((entry ->> 'timestamp')::double precision)
  into
    v_method,
    v_authenticated_at
  from jsonb_array_elements(coalesce(v_claims -> 'amr', '[]'::jsonb)) as amr(entry)
  where coalesce(entry ->> 'method', '') not in ('token_refresh', 'anonymous')
    and coalesce(entry ->> 'timestamp', '') ~ '^[0-9]+([.][0-9]+)?$'
  order by (entry ->> 'timestamp')::double precision desc
  limit 1;

  v_age_seconds := case
    when v_authenticated_at is null then null
    else greatest(0, floor(extract(epoch from (now() - v_authenticated_at)))::integer)
  end;

  return jsonb_build_object(
    'fresh',
      v_authenticated_at is not null
      and v_authenticated_at >= now() - make_interval(secs => v_max_age),
    'method', v_method,
    'authenticatedAt', v_authenticated_at,
    'ageSeconds', v_age_seconds,
    'maxAgeSeconds', v_max_age,
    'sessionId', v_session_id
  );
end
$freshness$;

revoke all on function private.studio2_auth_freshness_evidence(integer)
  from public, anon, authenticated;

create or replace function private.studio2_require_fresh_auth(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $require_fresh$
declare
  v_evidence jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_evidence := private.studio2_auth_freshness_evidence(p_max_age_seconds);

  if not coalesce((v_evidence ->> 'fresh')::boolean, false) then
    raise exception 'Fresh authentication required for this R3 operation'
      using errcode = '42501',
            hint = 'Re-enter your Solaris account password, then retry the exact reviewed operation.';
  end if;

  return v_evidence;
end
$require_fresh$;

revoke all on function private.studio2_require_fresh_auth(integer)
  from public, anon, authenticated;

create or replace function public.studio2_r3_auth_status(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $status$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return private.studio2_auth_freshness_evidence(p_max_age_seconds);
end
$status$;

revoke all on function public.studio2_r3_auth_status(integer)
  from public, anon;
grant execute on function public.studio2_r3_auth_status(integer)
  to authenticated, service_role;

-- Keep the existing operation implementation as the canonical mutation engine,
-- but close it to browser callers. The R3 wrapper below owns freshness policy.
revoke execute on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from authenticated;
grant execute on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to service_role;

create or replace function public.studio2_apply_permission_change_r3(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid,
  p_expires_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $r3$
declare
  v_actor uuid := auth.uid();
  v_existing public.studio2_operation_receipts;
  v_evidence jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lost-response reconciliation is allowed without another fresh-auth prompt,
  -- but only for the exact already-succeeded operation identity.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'permissions.' || p_change_kind
    and receipt.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return v_existing.result;
  end if;

  v_evidence := private.studio2_require_fresh_auth(300);

  v_result := public.studio2_apply_permission_change(
    p_user_id,
    p_change_kind,
    p_key,
    p_edition_id,
    p_expires_at,
    p_operation_id,
    p_idempotency_key,
    p_expected_version
  );

  update public.studio2_operation_receipts
  set
    actor_session_id = v_evidence ->> 'sessionId',
    auth_freshness_evidence = v_evidence,
    updated_at = now()
  where operation_id = p_operation_id
    and actor_id = v_actor;

  update public.admin_audit_log
  set after_data =
    coalesce(after_data, '{}'::jsonb)
    || jsonb_build_object(
      'actorSessionId', v_evidence ->> 'sessionId',
      'authFreshness', v_evidence
    )
  where actor_id = v_actor
    and action = 'permission_' || p_change_kind
    and after_data ->> 'operationId' = p_operation_id::text;

  return v_result;
end
$r3$;

revoke all on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
