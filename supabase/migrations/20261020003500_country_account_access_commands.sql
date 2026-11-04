begin;

select public.v3_register_migration_contract(
  '20261020003500_country_account_access_commands',
  1,
  'forward_fix_only',
  false,
  null,
  'Versioned/idempotent country-account suspension and restoration with authoritative receipts.'
);

create or replace function public.studio2_country_account_access_preview(
  p_user_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_account public.country_accounts%rowtype;
  v_country public.countries%rowtype;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    raise exception 'Country account is required' using errcode = '22023';
  end if;
  if p_target_status not in ('active', 'suspended') then
    raise exception 'Invalid country-account target status' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = p_user_id;

  if v_account.user_id is null then
    raise exception 'Country account not found' using errcode = 'P0002';
  end if;

  select country.* into v_country
  from public.countries country
  where country.id = v_account.country_id;

  if v_country.id is null then
    raise exception 'Country account has no canonical country' using errcode = '23503';
  end if;

  if v_account.status = p_target_status then
    v_blockers := v_blockers || jsonb_build_array(
      case
        when p_target_status = 'suspended' then 'This country account is already suspended.'
        else 'This country account is already active.'
      end
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'countryName', v_country.name,
    'currentStatus', v_account.status,
    'currentSuspensionReason', v_account.suspension_reason,
    'currentUpdatedAt', v_account.updated_at,
    'expectedVersion', v_account.updated_at,
    'targetStatus', p_target_status,
    'sessionPolicy', 'preserve_authenticated_session',
    'sessionPolicyDetail', 'Suspension removes country editing authority through canonical country-account state; it does not sign the account out or remove public Solaris access.',
    'consequence', case
      when p_target_status = 'suspended'
        then 'Country-profile editing authority is removed until the account is restored.'
      else 'Country-profile editing authority is restored without changing participation, entries or results.'
    end,
    'blockers', v_blockers,
    'serverTime', statement_timestamp()
  );
end;
$preview$;

revoke all on function public.studio2_country_account_access_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_country_account_access_preview(uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_country_account_access(
  p_user_id uuid,
  p_target_status text,
  p_reason text,
  p_expected_updated_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_before public.country_accounts%rowtype;
  v_after public.country_accounts%rowtype;
  v_country public.countries%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if p_user_id is null or p_expected_updated_at is null
     or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Country account, expected version, operation id and idempotency key are required'
      using errcode = '22023';
  end if;
  if p_target_status not in ('active', 'suspended') then
    raise exception 'Invalid country-account target status' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  select account.* into v_before
  from public.country_accounts account
  where account.user_id = p_user_id;
  if v_before.user_id is null then
    raise exception 'Country account not found' using errcode = 'P0002';
  end if;

  select country.* into v_country
  from public.countries country
  where country.id = v_before.country_id;
  if v_country.id is null then
    raise exception 'Country account has no canonical country' using errcode = '23503';
  end if;

  v_command := case
    when p_target_status = 'suspended' then 'delegation.suspend'
    else 'delegation.restore'
  end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    v_command,
    'R2',
    jsonb_build_object(
      'userId', p_user_id,
      'countryId', v_before.country_id,
      'targetStatus', p_target_status,
      'reason', v_reason,
      'expectedUpdatedAt', p_expected_updated_at
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result';
    end if;
    raise exception 'Country account access operation is already in progress or failed and requires reconciliation'
      using errcode = '40001';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select account.* into v_before
  from public.country_accounts account
  where account.user_id = p_user_id
  for update;

  if v_before.user_id is null then
    raise exception 'Country account not found' using errcode = 'P0002';
  end if;
  if v_before.country_id <> v_country.id then
    raise exception 'Country account ownership changed while the operation was being prepared'
      using errcode = '40001';
  end if;
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'Country account changed since the reviewed state. Refresh and review the access change again.'
      using errcode = '40001';
  end if;
  if v_before.status = p_target_status then
    raise exception 'Country account is already in the requested access state'
      using errcode = '23514';
  end if;

  update public.country_accounts
  set
    status = p_target_status,
    suspension_reason = case when p_target_status = 'suspended' then v_reason else null end,
    suspended_at = case when p_target_status = 'suspended' then now() else null end,
    suspended_by = case when p_target_status = 'suspended' then auth.uid() else null end,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_after;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    country_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    case
      when p_target_status = 'suspended' then 'country_account_suspended'
      else 'country_account_restored'
    end,
    'country_accounts',
    p_user_id::text,
    v_after.country_id,
    jsonb_build_object(
      'status', v_before.status,
      'suspensionReason', v_before.suspension_reason,
      'updatedAt', v_before.updated_at
    ),
    jsonb_build_object(
      'status', v_after.status,
      'suspensionReason', v_after.suspension_reason,
      'updatedAt', v_after.updated_at,
      'sessionPolicy', 'preserve_authenticated_session'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'command', v_command,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'userId', v_after.user_id,
    'countryId', v_after.country_id,
    'countryName', v_country.name,
    'previousStatus', v_before.status,
    'status', v_after.status,
    'previousVersion', v_before.updated_at,
    'version', v_after.updated_at,
    'sessionPolicy', 'preserve_authenticated_session',
    'serverTime', statement_timestamp()
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end;
$apply$;

revoke all on function public.studio2_apply_country_account_access(uuid, text, text, timestamptz, uuid, text)
  from public, anon;
grant execute on function public.studio2_apply_country_account_access(uuid, text, text, timestamptz, uuid, text)
  to authenticated, service_role;

-- V3 cutover: authenticated browsers use the governed command above. Keep the
-- legacy signature available to service-role compatibility jobs only during the
-- migration window so there is no second browser authority for account access.
revoke all on function public.admin_set_country_account_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_country_account_status(uuid, text, text)
  to service_role;

comment on function public.studio2_country_account_access_preview(uuid, text) is
  'V3 Organizer exact-account access preview. updated_at is the canonical expected-version token for suspension/restoration.';
comment on function public.studio2_apply_country_account_access(uuid, text, text, timestamptz, uuid, text) is
  'V3 versioned/idempotent country-account suspension/restoration command using canonical delegation.suspend/delegation.restore operation identities.';
comment on function public.admin_set_country_account_status(uuid, text, text) is
  'Legacy country-account access mutation retained for service-role compatibility only. Authenticated Organizer clients must use studio2_apply_country_account_access.';

notify pgrst, 'reload schema';
commit;
