begin;

-- System V3 S9 participant Jury error-boundary hardening.
--
-- The S2 operation ledger intentionally retains bounded technical diagnostics for
-- operators. Those diagnostics are not participant response data. The public
-- Jury submit/reconcile RPCs expose only the canonical error class so SQLSTATE,
-- database messages and diagnostic metadata cannot leak through a failed replay
-- or lost-response reconciliation.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9.jury-submit-safe-error-boundary-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Keep Jury S2 failure diagnostics durable for operators while returning only standardized safe error classes to participant submit and reconciliation callers.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_public_operation_error(p_error jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $public_error$
  with normalized as (
    select upper(nullif(btrim(coalesce(p_error ->> 'code', '')), '')) as code
  )
  select case
    when jsonb_typeof(p_error) is distinct from 'object' then null
    else jsonb_build_object(
      'code',
      case
        when normalized.code in (
          'AUTHENTICATION',
          'AUTHORIZATION',
          'VALIDATION',
          'STATE_CHANGED',
          'VERSION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'RATE_LIMIT',
          'DEPENDENCY_FAILURE',
          'DATABASE',
          'STORAGE',
          'TIMEOUT',
          'UNKNOWN'
        ) then normalized.code
        else 'UNKNOWN'
      end
    )
  end
  from normalized
$public_error$;

revoke all on function private.v3_public_operation_error(jsonb)
  from public, anon, authenticated, service_role;

-- Keep every implementation layer non-callable from client/service JWT roles.
-- The outer participant RPC remains the only public command boundary.
alter function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  rename to v3_submit_jury_ballot_validated_impl;
revoke all on function public.v3_submit_jury_ballot_validated_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.v3_submit_jury_ballot_s2_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.v3_submit_jury_ballot_legacy_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.v3_submit_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid,
  _operation_id uuid,
  _request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $jury_submit_safe$
declare
  v_response jsonb;
begin
  v_response := public.v3_submit_jury_ballot_validated_impl(
    _show_id,
    _entries,
    _preflight_id,
    _operation_id,
    _request_hash
  );

  if jsonb_typeof(v_response) is distinct from 'object' then
    raise exception 'Jury submission returned an invalid response'
      using errcode = '55000';
  end if;

  if v_response ? 'error' then
    v_response := jsonb_set(
      v_response,
      '{error}',
      coalesce(private.v3_public_operation_error(v_response -> 'error'), 'null'::jsonb),
      true
    );
  end if;

  return v_response;
end
$jury_submit_safe$;

revoke all on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  to authenticated;

alter function public.v3_reconcile_jury_submission(uuid)
  rename to v3_reconcile_jury_submission_internal_impl;
revoke all on function public.v3_reconcile_jury_submission_internal_impl(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.v3_reconcile_jury_submission_legacy_impl(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.v3_reconcile_jury_submission(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $jury_reconcile_safe$
declare
  v_response jsonb;
begin
  v_response := public.v3_reconcile_jury_submission_internal_impl(_operation_id);

  if jsonb_typeof(v_response) is distinct from 'object' then
    raise exception 'Jury reconciliation returned an invalid response'
      using errcode = '55000';
  end if;

  if v_response ? 'error' then
    v_response := jsonb_set(
      v_response,
      '{error}',
      coalesce(private.v3_public_operation_error(v_response -> 'error'), 'null'::jsonb),
      true
    );
  end if;

  return v_response;
end
$jury_reconcile_safe$;

revoke all on function public.v3_reconcile_jury_submission(uuid)
  from public, anon, service_role;
grant execute on function public.v3_reconcile_jury_submission(uuid)
  to authenticated;

comment on function private.v3_public_operation_error(jsonb) is
  'Maps an internal S2 error object to the bounded canonical error class safe for participant responses. Internal metadata remains in the operation ledger only.';
comment on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text) is
  'Public participant Jury submission boundary. Delegates to the validated canonical writer and strips internal S2 error diagnostics from failed/replayed responses.';
comment on function public.v3_reconcile_jury_submission(uuid) is
  'Public participant Jury reconciliation boundary. Returns owner-bound operation truth without exposing internal S2 diagnostic metadata.';

notify pgrst, 'reload schema';

commit;
