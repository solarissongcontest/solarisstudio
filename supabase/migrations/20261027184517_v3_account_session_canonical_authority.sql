begin;

-- TerraOS 3 / Solaris Studio V3 account + session authority hardening.
--
-- Canonical security truth stays synchronous:
--   * public.country_accounts owns permission-relevant Solaris account state;
--   * auth.sessions owns active Supabase Auth session truth;
--   * public.studio2_account_session_revocations is reconciliation/audit state.
--
-- Events may invalidate projections later, but no authorization decision below
-- depends on event delivery, realtime, cache invalidation, or UI state.
select public.v3_register_migration_contract(
  'v3.account-session.canonical-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Consolidate country-account writers and serialize active-session authority with revocation'
);

-- ---------------------------------------------------------------------------
-- Session authority: serialize a request that has acquired active-session
-- authority against deletion of that exact auth.sessions row.
--
-- A request that reaches this guard before revocation obtains a KEY SHARE lock
-- for its transaction. Canonical revocation DELETE therefore waits for that
-- already-authorized transaction to finish. Once DELETE commits, later requests
-- cannot acquire the row and fail SESSION_REVOKED. This is the achievable
-- security boundary; an operation already committed cannot be retroactively
-- cancelled after revocation.
-- ---------------------------------------------------------------------------
create or replace function private.v3_require_active_auth_session()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, auth, public, private
as $active$
declare
  v_actor uuid := auth.uid();
  v_claim text := nullif(auth.jwt() ->> 'session_id', '');
  v_claimed_session uuid;
  v_locked_session uuid;
begin
  if v_actor is null or v_claim is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  begin
    v_claimed_session := v_claim::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end;

  select session_row.id
  into v_locked_session
  from auth.sessions session_row
  where session_row.id = v_claimed_session
    and session_row.user_id = v_actor
    and (session_row.not_after is null or session_row.not_after > now())
  for key share;

  if v_locked_session is null then
    raise exception using
      errcode = '42501',
      message = 'SESSION_REVOKED',
      hint = 'Sign in again to continue.';
  end if;

  return v_locked_session;
end
$active$;

revoke all on function private.v3_require_active_auth_session()
  from public, anon, authenticated;

-- The active-session helper now acquires a transaction lock, so callers that
-- invoke it are correctly classified VOLATILE rather than advertising a stable
-- read contract they no longer have.
alter function private.studio2_require_fresh_auth(integer) volatile;
alter function public.studio2_r3_auth_status(integer) volatile;
alter function public.v3_my_sessions() volatile;

-- Revocation history is not a service_role mutation surface. The governed
-- revocation command remains SECURITY DEFINER and writes this table itself.
revoke all on table public.studio2_account_session_revocations
  from public, anon, authenticated, service_role;
grant select on table public.studio2_account_session_revocations
  to service_role;

-- ---------------------------------------------------------------------------
-- Account authority: direct API DML is retired. Browser and service-role code
-- may read only; all permission-relevant mutations pass through governed RPCs.
-- ---------------------------------------------------------------------------
revoke all on table public.country_accounts
  from public, anon, authenticated, service_role;
grant select on table public.country_accounts
  to authenticated, service_role;

-- Retire direct-write RLS surfaces. SELECT policy remains authoritative for
-- browser reads; SECURITY DEFINER commands below own mutations.
drop policy if exists "country accounts organizer manage" on public.country_accounts;
drop policy if exists "country accounts capability manage" on public.country_accounts;
drop policy if exists "country accounts capability manage insert" on public.country_accounts;
drop policy if exists "country accounts capability manage update" on public.country_accounts;
drop policy if exists "country accounts capability manage delete" on public.country_accounts;

-- Second wall against privilege drift. Canonical account commands and the one
-- sanctioned auth.users signup trigger set this transaction-local marker before
-- touching the table. Migration owners are permitted so schema/data migrations
-- remain operable without manufacturing request claims.
create or replace function private.v3_guard_country_account_writer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  if session_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if current_setting('studio2.account_write_authorized', true) is distinct from 'on' then
    raise exception using
      errcode = '42501',
      message = 'ACCOUNT_WRITE_AUTHORITY_REQUIRED',
      hint = 'Use the governed Solaris account command.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_country_account_writer()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_country_account_writer on public.country_accounts;
create trigger v3_guard_country_account_writer
before insert or update or delete on public.country_accounts
for each row
execute function private.v3_guard_country_account_writer();

-- ---------------------------------------------------------------------------
-- Canonical account claim command.
-- Uniqueness constraints are the concurrency authority for one-account/one-
-- country assignment. A retry with a new operation identity reconciles to the
-- already-owned canonical row rather than duplicating state.
-- ---------------------------------------------------------------------------
create or replace function public.v3_claim_country_account(
  p_country_id uuid,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $claim$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_existing public.country_accounts;
  v_account public.country_accounts;
  v_result jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();

  if p_country_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if private.studio2_country_claim_blocked(v_actor) then
    raise exception 'Organizer accounts do not claim country accounts.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.countries where id = p_country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'account.country.claim',
    'R2',
    jsonb_build_object('countryId', p_country_id),
    jsonb_build_object('countryId', p_country_id)
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
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select account_row.*
  into v_existing
  from public.country_accounts account_row
  where account_row.user_id = v_actor
  for update;

  if v_existing.user_id is not null then
    if v_existing.country_id is distinct from p_country_id then
      raise exception 'This account already owns a country.' using errcode = '23505';
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'countryId', v_existing.country_id,
      'accountUserId', v_existing.user_id,
      'status', v_existing.status,
      'updatedAt', v_existing.updated_at,
      'alreadyApplied', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  else
    perform set_config('studio2.account_write_authorized', 'on', true);
    begin
      insert into public.country_accounts (user_id, country_id)
      values (v_actor, p_country_id)
      returning * into v_account;
    exception when unique_violation then
      raise exception 'That country already has an account.' using errcode = '23505';
    end;

    v_result := jsonb_build_object(
      'ok', true,
      'countryId', v_account.country_id,
      'accountUserId', v_account.user_id,
      'status', v_account.status,
      'updatedAt', v_account.updated_at,
      'alreadyApplied', false,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  end if;

  update public.studio2_operation_receipts
  set actor_session_id = v_session_id::text,
      updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$claim$;

revoke all on function public.v3_claim_country_account(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.v3_claim_country_account(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Canonical organizer status command.
-- updated_at is the account row's optimistic concurrency token.
-- ---------------------------------------------------------------------------
create or replace function public.v3_set_country_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text,
  p_expected_updated_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $status$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_account public.country_accounts;
  v_reason text := case
    when p_status = 'suspended' then nullif(btrim(coalesce(p_reason, '')), '')
    else null
  end;
  v_result jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();

  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if p_user_id is null
     or p_status not in ('active', 'suspended')
     or p_expected_updated_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'account.status.change',
    'R2',
    jsonb_build_object('userId', p_user_id),
    jsonb_build_object(
      'userId', p_user_id,
      'status', p_status,
      'reason', v_reason,
      'expectedUpdatedAt', p_expected_updated_at
    )
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
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select account_row.*
  into v_account
  from public.country_accounts account_row
  where account_row.user_id = p_user_id
  for update;

  if v_account.user_id is null then
    raise exception 'Country account not found.' using errcode = '22023';
  end if;

  if v_account.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      hint = 'Reload the account and review the access change again.';
  end if;

  if v_account.status is not distinct from p_status
     and v_account.suspension_reason is not distinct from v_reason then
    v_result := jsonb_build_object(
      'ok', true,
      'userId', v_account.user_id,
      'countryId', v_account.country_id,
      'status', v_account.status,
      'reason', v_account.suspension_reason,
      'updatedAt', v_account.updated_at,
      'alreadyApplied', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  else
    perform set_config('studio2.account_write_authorized', 'on', true);
    update public.country_accounts
    set
      status = p_status,
      suspension_reason = v_reason,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      suspended_by = case when p_status = 'suspended' then v_actor else null end,
      updated_at = now()
    where user_id = p_user_id
      and updated_at = p_expected_updated_at
    returning * into v_account;

    if v_account.user_id is null then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'userId', v_account.user_id,
      'countryId', v_account.country_id,
      'status', v_account.status,
      'reason', v_account.suspension_reason,
      'updatedAt', v_account.updated_at,
      'alreadyApplied', false,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  end if;

  update public.studio2_operation_receipts
  set actor_session_id = v_session_id::text,
      updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$status$;

revoke all on function public.v3_set_country_account_status(uuid, text, text, timestamptz, uuid, text)
  from public, anon, service_role;
grant execute on function public.v3_set_country_account_status(uuid, text, text, timestamptz, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Canonical owner setting. This preference affects future delegation ownership
-- history, so a suspended account cannot change it.
-- ---------------------------------------------------------------------------
create or replace function public.v3_set_owned_hod_auto_assign(
  p_enabled boolean,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $auto$
declare
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_account public.country_accounts;
  v_result jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();

  if p_enabled is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'account.hod_auto_assign.change',
    'R2',
    jsonb_build_object('userId', v_actor),
    jsonb_build_object('enabled', p_enabled)
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
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select account_row.*
  into v_account
  from public.country_accounts account_row
  where account_row.user_id = v_actor
    and account_row.status = 'active'
  for update;

  if v_account.user_id is null then
    raise exception 'An active country account is required.' using errcode = '42501';
  end if;

  if v_account.hod_auto_assign_future is distinct from p_enabled then
    perform set_config('studio2.account_write_authorized', 'on', true);
    update public.country_accounts
    set hod_auto_assign_future = p_enabled,
        updated_at = now()
    where user_id = v_actor
    returning * into v_account;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'userId', v_account.user_id,
    'countryId', v_account.country_id,
    'enabled', v_account.hod_auto_assign_future,
    'updatedAt', v_account.updated_at,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'replayed', false
  );

  update public.studio2_operation_receipts
  set actor_session_id = v_session_id::text,
      updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$auto$;

revoke all on function public.v3_set_owned_hod_auto_assign(boolean, uuid, text)
  from public, anon, service_role;
grant execute on function public.v3_set_owned_hod_auto_assign(boolean, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Compatibility adapters. These names remain because current UI callers still
-- use them, but they no longer write country_accounts. They route through the
-- governed commands above and therefore are compatibility transports, not
-- competing mutation authorities.
-- ---------------------------------------------------------------------------
create or replace function public.claim_country_account(_country_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $legacy_claim$
declare
  v_result jsonb;
  v_operation_id uuid := gen_random_uuid();
begin
  v_result := public.v3_claim_country_account(
    _country_id,
    v_operation_id,
    'legacy-claim-' || v_operation_id::text
  );
  return (v_result ->> 'countryId')::uuid;
end
$legacy_claim$;

revoke all on function public.claim_country_account(uuid)
  from public, anon, service_role;
grant execute on function public.claim_country_account(uuid)
  to authenticated;

create or replace function public.admin_set_country_account_status(
  _user_id uuid,
  _status text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $legacy_status$
declare
  v_expected_updated_at timestamptz;
  v_operation_id uuid := gen_random_uuid();
begin
  -- Read the optimistic token immediately before entering the canonical command.
  -- Concurrent compatibility calls that read the same version still serialize
  -- and one fails STATE_CHANGED rather than silently overwriting the other.
  select account_row.updated_at
  into v_expected_updated_at
  from public.country_accounts account_row
  where account_row.user_id = _user_id;

  if v_expected_updated_at is null then
    raise exception 'Country account not found.' using errcode = '22023';
  end if;

  return public.v3_set_country_account_status(
    _user_id,
    _status,
    _reason,
    v_expected_updated_at,
    v_operation_id,
    'legacy-status-' || v_operation_id::text
  );
end
$legacy_status$;

revoke all on function public.admin_set_country_account_status(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.admin_set_country_account_status(uuid, text, text)
  to authenticated;

create or replace function public.set_owned_hod_auto_assign(_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $legacy_auto$
declare
  v_operation_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  v_result := public.v3_set_owned_hod_auto_assign(
    _enabled,
    v_operation_id,
    'legacy-hod-auto-' || v_operation_id::text
  );
  return coalesce((v_result ->> 'enabled')::boolean, _enabled);
end
$legacy_auto$;

revoke all on function public.set_owned_hod_auto_assign(boolean)
  from public, anon, service_role;
grant execute on function public.set_owned_hod_auto_assign(boolean)
  to authenticated;

-- The auth.users trigger is the one sanctioned internal account writer: there is
-- no authenticated Solaris session yet. Keep its current validation semantics,
-- but enter the same guarded table authority before inserting.
create or replace function public.claim_country_from_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $signup$
declare
  v_country_id uuid;
  v_country_text text;
  v_instagram_username text;
  v_display_name text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'country' then
    return new;
  end if;

  v_country_text := nullif(new.raw_user_meta_data ->> 'country_id', '');
  if v_country_text is null then
    raise exception 'Choose a country for this account.' using errcode = '22023';
  end if;

  begin
    v_country_id := v_country_text::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid country selection.' using errcode = '22023';
  end;

  if not exists (select 1 from public.countries where id = v_country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  v_instagram_username := lower(regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'instagram_username', '')), '^@+', ''));
  v_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');

  if v_instagram_username = ''
     or length(v_instagram_username) > 30
     or v_instagram_username !~ '^[a-z0-9._]+$' then
    raise exception 'A valid Instagram username is required.' using errcode = '22023';
  end if;

  if v_display_name is null or length(v_display_name) > 80 then
    raise exception 'A name or nickname is required.' using errcode = '22023';
  end if;

  perform set_config('studio2.account_write_authorized', 'on', true);
  begin
    insert into public.country_accounts (user_id, country_id, instagram_username, display_name)
    values (new.id, v_country_id, v_instagram_username, v_display_name);
  exception when unique_violation then
    if exists (
      select 1 from public.country_accounts account_row
      where lower(account_row.instagram_username) = v_instagram_username
    ) then
      raise exception 'That Instagram username already has a Solaris Studio account.' using errcode = '23505';
    end if;
    raise exception 'That country already has an account.' using errcode = '23505';
  end;

  return new;
end
$signup$;

revoke all on function public.claim_country_from_signup()
  from public, anon, authenticated, service_role;

comment on function private.v3_require_active_auth_session() is
  'Canonical active-session guard. Locks the signed auth.sessions row FOR KEY SHARE so revocation cannot become effective midway through an already-authorized DB transaction.';
comment on function public.v3_claim_country_account(uuid, uuid, text) is
  'Canonical idempotent user country-account claim command.';
comment on function public.v3_set_country_account_status(uuid, text, text, timestamptz, uuid, text) is
  'Canonical capability-checked country-account status command with optimistic concurrency.';
comment on function public.v3_set_owned_hod_auto_assign(boolean, uuid, text) is
  'Canonical active-owner command for the account HOD carry-forward setting.';

notify pgrst, 'reload schema';

commit;
