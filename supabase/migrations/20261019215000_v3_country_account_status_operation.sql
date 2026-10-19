begin;

-- System V3 / Organizer O4: country-account suspension changes real delegation
-- authority and must therefore be a versioned, receipted server operation.
-- This migration also closes a sibling authorization regression where the newer
-- two-argument owns_country(user,country) helper forgot to require active status.
--
-- S13 contract: additive/compatible forward fix. Existing account rows receive
-- revision=1; legacy admin RPC callers are routed through the same canonical
-- writer during rollout rather than retaining a second mutation authority.
select public.v3_register_migration_contract(
  '20261019215000_v3_country_account_status_operation',
  1,
  'forward_fix_only',
  false,
  null,
  'Versioned receipted country-account suspension/restoration and active-owner gate'
);

alter table public.country_accounts
  add column if not exists revision bigint not null default 1;

alter table public.country_accounts
  drop constraint if exists country_accounts_revision_check;
alter table public.country_accounts
  add constraint country_accounts_revision_check check (revision >= 1);

create or replace function private.studio2_country_account_revision_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if (to_jsonb(new) - 'revision' - 'updated_at')
       is distinct from
     (to_jsonb(old) - 'revision' - 'updated_at') then
    new.revision := old.revision + 1;
    new.updated_at := now();
  else
    new.revision := old.revision;
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_country_account_revision_guard()
  from public, anon, authenticated;

drop trigger if exists studio2_country_account_revision_guard on public.country_accounts;
create trigger studio2_country_account_revision_guard
before update on public.country_accounts
for each row execute function private.studio2_country_account_revision_guard();

-- Suspension is an authorization state, not merely Organizer decoration. Keep
-- both legacy/current ownership helpers status-aware so an already-authenticated
-- suspended account loses country-owner powers immediately on the next request.
create or replace function public.owns_country(_user_id uuid, _country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $owns$
  select
    _user_id is not null
    and _country_id is not null
    and (
      _user_id = auth.uid()
      or public.studio2_access_allowed('delegation.read', null, true)
    )
    and exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = _user_id
        and ca.country_id = _country_id
        and ca.status = 'active'
    )
$owns$;

revoke all on function public.owns_country(uuid, uuid) from public, anon;
grant execute on function public.owns_country(uuid, uuid) to authenticated, service_role;

-- Browser clients have no reason to mutate the ownership table directly. Signup
-- uses the service role / canonical claim RPC, and Organizer status changes use
-- the command below. Keep SELECT for existing own-account/read projections.
revoke insert, update, delete on table public.country_accounts from authenticated;
drop policy if exists "country accounts organizer manage" on public.country_accounts;

create or replace function public.studio2_country_account_status_preview(
  p_user_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_actor uuid := auth.uid();
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_account public.country_accounts%rowtype;
  v_email text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_user_id is null or v_target_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_target_status = 'suspended' and v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = p_user_id;

  if v_account.user_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select case
    when lower(coalesce(users.email, '')) like '%@country.solaris.invalid' then null
    else users.email::text
  end
  into v_email
  from auth.users users
  where users.id = p_user_id;

  return jsonb_build_object(
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'email', v_email,
    'currentStatus', v_account.status,
    'currentReason', v_account.suspension_reason,
    'targetStatus', v_target_status,
    'targetReason', case when v_target_status = 'suspended' then v_reason else null end,
    'expectedVersion', v_account.revision,
    'alreadyApplied',
      v_account.status = v_target_status
      and coalesce(v_account.suspension_reason, '') = coalesce(
        case when v_target_status = 'suspended' then v_reason else null end,
        ''
      ),
    'riskClass', 'R2',
    'sessionPolicy', jsonb_build_object(
      'existingAuthSession', 'retained',
      'delegationAuthorization', case
        when v_target_status = 'suspended' then 'revoked_on_next_server_request'
        else 'restored_on_next_server_request'
      end,
      'newCountrySignin', case
        when v_target_status = 'suspended' then 'blocked'
        else 'allowed'
      end
    ),
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_country_account_status_preview(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_country_account_status_preview(uuid, text, text)
  to authenticated;

create or replace function public.studio2_apply_country_account_status(
  p_user_id uuid,
  p_target_status text,
  p_reason text,
  p_expected_version bigint,
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
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_account public.country_accounts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_scope jsonb;
  v_semantic_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_claim_status text;
  v_result jsonb;
  v_failure jsonb;
  v_command text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_user_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or v_target_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_target_status = 'suspended' and v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = p_user_id;

  if v_account.user_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  v_command := case
    when v_target_status = 'suspended' then 'delegation.suspend'
    else 'delegation.restore'
  end;
  v_scope := jsonb_build_object(
    'userId', p_user_id,
    'countryId', v_account.country_id,
    'expectedVersion', p_expected_version
  );
  v_semantic_request := jsonb_build_object(
    'targetStatus', v_target_status,
    'reason', case when v_target_status = 'suspended' then v_reason else null end
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    v_scope,
    v_semantic_request
  );

  begin
    v_operation_id := nullif(v_claim ->> 'operationId', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end;
  if v_operation_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_claim_status := nullif(v_claim ->> 'status', '');
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim_status = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object(
          'ok', true,
          'operationId', v_operation_id,
          'receiptId', v_operation_id,
          'replayed', true,
          'serverTime', now()
        );
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'ok', false,
      'operationId', v_operation_id,
      'receiptId', v_operation_id,
      'status', coalesce(v_claim_status, 'unknown'),
      'error', v_claim -> 'error',
      'replayed', true,
      'serverTime', now()
    ));
  end if;

  if v_claim_status is distinct from 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  v_before := jsonb_build_object(
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'status', v_account.status,
    'suspensionReason', v_account.suspension_reason,
    'suspendedAt', v_account.suspended_at,
    'suspendedBy', v_account.suspended_by,
    'revision', v_account.revision,
    'updatedAt', v_account.updated_at
  );

  update public.country_accounts account
  set
    status = v_target_status,
    suspension_reason = case when v_target_status = 'suspended' then v_reason else null end,
    suspended_at = case when v_target_status = 'suspended' then now() else null end,
    suspended_by = case when v_target_status = 'suspended' then v_actor else null end
  where account.user_id = p_user_id
    and account.country_id = v_account.country_id
    and account.revision = p_expected_version
  returning account.* into v_account;

  if v_account.user_id is null then
    select account.*
    into v_account
    from public.country_accounts account
    where account.user_id = p_user_id;

    v_failure := private.studio2_fail_operation(
      v_operation_id,
      'VERSION_CONFLICT',
      jsonb_build_object(
        'expectedVersion', p_expected_version,
        'currentVersion', v_account.revision,
        'currentStatus', v_account.status,
        'countryId', v_account.country_id
      )
    );

    return jsonb_build_object(
      'ok', false,
      'operationId', v_operation_id,
      'receiptId', v_operation_id,
      'status', 'failed',
      'error', v_failure -> 'error',
      'replayed', false,
      'serverTime', now()
    );
  end if;

  v_after := jsonb_build_object(
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'status', v_account.status,
    'suspensionReason', v_account.suspension_reason,
    'suspendedAt', v_account.suspended_at,
    'suspendedBy', v_account.suspended_by,
    'revision', v_account.revision,
    'updatedAt', v_account.updated_at
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
    v_actor,
    v_command,
    'country_accounts',
    p_user_id::text,
    v_account.country_id,
    v_before,
    v_after || jsonb_build_object(
      'operationId', v_operation_id,
      'reason', case when v_target_status = 'suspended' then v_reason else null end
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'status', v_account.status,
    'suspensionReason', v_account.suspension_reason,
    'version', v_account.revision,
    'previousVersion', p_expected_version,
    'sessionPolicy', jsonb_build_object(
      'existingAuthSession', 'retained',
      'delegationAuthorization', case
        when v_target_status = 'suspended' then 'revoked_on_next_server_request'
        else 'restored_on_next_server_request'
      end,
      'newCountrySignin', case
        when v_target_status = 'suspended' then 'blocked'
        else 'allowed'
      end
    ),
    'replayed', false,
    'serverTime', now()
  );

  v_result := private.studio2_complete_operation(v_operation_id, v_result);
  return v_result;
end
$apply$;

revoke all on function public.studio2_apply_country_account_status(
  uuid, text, text, bigint, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_apply_country_account_status(
  uuid, text, text, bigint, uuid, text, uuid
) to authenticated;

-- Compatibility adapter. It retains the old signature/return shape but no
-- longer writes the table directly. New Organizer V3 must use preview+apply with
-- caller-owned operation identity and expectedVersion.
create or replace function public.admin_set_country_account_status(
  _user_id uuid,
  _status text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacy$
declare
  v_actor uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_operation_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = _user_id;

  if v_account.user_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_result := public.studio2_apply_country_account_status(
    _user_id,
    _status,
    _reason,
    v_account.revision,
    v_operation_id,
    'legacy-admin-set-country-account-status:' || v_operation_id::text,
    v_operation_id
  );

  if not coalesce((v_result ->> 'ok')::boolean, false) then
    if v_result #>> '{error,code}' = 'VERSION_CONFLICT' then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = coalesce(v_result #>> '{error,code}', 'STATE_CHANGED');
  end if;

  select to_jsonb(account.*)
  into v_result
  from public.country_accounts account
  where account.user_id = _user_id;

  return v_result;
end
$legacy$;

revoke all on function public.admin_set_country_account_status(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_country_account_status(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
