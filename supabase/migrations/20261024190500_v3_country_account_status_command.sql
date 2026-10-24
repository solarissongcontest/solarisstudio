begin;

-- System V3: govern Organizer suspension/restoration of country editing access.
--
-- Existing account-status reads already expose country_accounts.updated_at and
-- country-owned writes resolve only active accounts. This command turns that
-- timestamp into the reviewed CAS boundary and reuses the canonical S2
-- operation/idempotency ledger. The legacy RPC remains temporarily callable so
-- the Organizer consumer can cut over without a flag-day deployment; it must
-- not be treated as V3 authority after that consumer lands.
select public.v3_register_migration_contract(
  'v3.s7.country-account-status-command',
  1,
  'forward_fix_only',
  false,
  null,
  'Add a version-bound, idempotent and receipted Organizer command for country-account suspension/restoration while preserving the legacy writer for staged cutover.'
);

-- country_accounts rows can disappear when an owning auth user is deleted and
-- may later be recreated for the same country. Therefore row-local revision is
-- not a safe DomainEvent aggregate version. Keep one private, durable per-country
-- sequence for canonical delegation.changed facts. No historical events are
-- invented or backfilled; the first canonical event for a country starts at 1.
create table if not exists private.v3_delegation_event_versions (
  country_id uuid primary key references public.countries(id) on delete restrict,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.v3_delegation_event_versions
  from public, anon, authenticated, service_role;

create or replace function public.studio2_set_country_account_status_v3(
  p_user_id uuid,
  p_country_id uuid,
  p_target_status text,
  p_reason text,
  p_expected_updated_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_actor uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_change_kind text;
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.country_accounts%rowtype;
  v_after public.country_accounts%rowtype;
  v_delegation_version bigint;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_user_id is null
     or p_country_id is null
     or p_expected_updated_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_reason is not null and length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_command := case v_status
    when 'suspended' then 'delegation.suspend'
    else 'delegation.restore'
  end;
  v_change_kind := case v_status
    when 'suspended' then 'suspended'
    else 'restored'
  end;

  -- Claim before mutable-state or current-capability validation. An exact retry
  -- must reconcile its durable receipt even if the actor's delegation.manage
  -- grant or the country account changed after the original response was lost.
  -- A brand-new unauthorized request still fails below; that exception rolls
  -- the claim back in the same transaction so no partial operation survives.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_build_object(
      'countryId', p_country_id,
      'subjectType', 'country_account',
      'subjectId', p_user_id
    ),
    jsonb_build_object(
      'userId', p_user_id,
      'countryId', p_country_id,
      'targetStatus', v_status,
      'reason', v_reason,
      'expectedUpdatedAt', p_expected_updated_at
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select account.*
  into v_before
  from public.country_accounts account
  where account.user_id = p_user_id
    and account.country_id = p_country_id
  for update;

  if v_before.user_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'Reload the country account and review the access change again.';
  end if;

  if v_before.status is not distinct from v_status then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      hint = 'The requested country-account access state is already current.';
  end if;

  update public.country_accounts account
  set
    status = v_status,
    suspension_reason = case when v_status = 'suspended' then v_reason else null end,
    suspended_at = case when v_status = 'suspended' then clock_timestamp() else null end,
    suspended_by = case when v_status = 'suspended' then v_actor else null end,
    updated_at = clock_timestamp()
  where account.user_id = p_user_id
    and account.country_id = p_country_id
    and account.updated_at = p_expected_updated_at
  returning account.* into v_after;

  if v_after.user_id is null then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'The country account changed before the access update could commit.';
  end if;

  insert into private.v3_delegation_event_versions(country_id, version, updated_at)
  values (p_country_id, 1, clock_timestamp())
  on conflict (country_id) do update
    set version = private.v3_delegation_event_versions.version + 1,
        updated_at = clock_timestamp()
  returning version into v_delegation_version;

  if v_delegation_version is null or v_delegation_version < 1 then
    raise exception 'Delegation aggregate version did not advance'
      using errcode = '23514';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    country_id,
    before_data,
    after_data
  ) values (
    v_actor,
    v_command,
    'country_accounts',
    p_user_id::text,
    p_country_id,
    jsonb_build_object(
      'userId', v_before.user_id,
      'countryId', v_before.country_id,
      'status', v_before.status,
      'suspensionReason', v_before.suspension_reason,
      'suspendedAt', v_before.suspended_at,
      'suspendedBy', v_before.suspended_by,
      'delegationVersion', v_delegation_version - 1,
      'updatedAt', v_before.updated_at
    ),
    jsonb_build_object(
      'operationId', v_operation_id,
      'userId', v_after.user_id,
      'countryId', v_after.country_id,
      'status', v_after.status,
      'reason', v_reason,
      'suspensionReason', v_after.suspension_reason,
      'suspendedAt', v_after.suspended_at,
      'suspendedBy', v_after.suspended_by,
      'delegationVersion', v_delegation_version,
      'updatedAt', v_after.updated_at
    )
  );

  -- Emit the canonical delegation fact transactionally with the authoritative
  -- write. No outbox consumer is claimed here: delegation.attention remains a
  -- separately declared S5 consequence until a real worker/reconciler exists.
  perform private.v3_emit_domain_event(
    'delegation.changed',
    'delegation',
    p_country_id::text,
    v_delegation_version,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'countryId', p_country_id,
      'changeKind', v_change_kind,
      'previousStatus', v_before.status,
      'status', v_after.status,
      'previousVersion', v_delegation_version - 1,
      'version', v_delegation_version
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'userId', v_after.user_id,
    'countryId', v_after.country_id,
    'previousStatus', v_before.status,
    'status', v_after.status,
    'suspensionReason', v_after.suspension_reason,
    'previousDelegationVersion', v_delegation_version - 1,
    'delegationVersion', v_delegation_version,
    'previousUpdatedAt', v_before.updated_at,
    'updatedAt', v_after.updated_at,
    'serverTime', clock_timestamp(),
    -- Authentication remains valid by design. Existing country-owned server
    -- paths already require country_accounts.status = active, so suspension is
    -- enforced on their next authoritative read/command rather than by deleting
    -- the user's public Solaris session.
    'sessionEffect', 'authentication_preserved_country_editing_rechecked_server_side'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_set_country_account_status_v3(
  uuid, uuid, text, text, timestamptz, uuid, text, uuid
) from public, anon, service_role;
grant execute on function public.studio2_set_country_account_status_v3(
  uuid, uuid, text, text, timestamptz, uuid, text, uuid
) to authenticated;

comment on function public.studio2_set_country_account_status_v3(
  uuid, uuid, text, text, timestamptz, uuid, text, uuid
) is
  'V3 Organizer country-account access transition. Requires actor-bound delegation.manage, exact user/country binding, reviewed updated_at CAS, semantic idempotency, immutable audit, durable per-country delegation.changed versioning and a durable S2 receipt. Exact replay reconciles before mutable authorization. Does not revoke the authentication session; country-owned edit authority is re-evaluated from active account state.';

notify pgrst, 'reload schema';

commit;
