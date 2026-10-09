begin;

-- Organisation OS V5: governed R3 permission mutations.
--
-- Access changes are unusually dangerous because they change who can perform
-- every other privileged action. Preview and execution therefore share one
-- authoritative per-user access revision. Any concurrent role/capability
-- change invalidates an older preview, regardless of edition scope.

create table if not exists public.studio2_permission_state_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_permission_state_versions enable row level security;
revoke all on table public.studio2_permission_state_versions
  from public, anon, authenticated;
grant all on table public.studio2_permission_state_versions to service_role;

create or replace function private.studio2_ensure_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permver$
declare
  v_version bigint;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;

  insert into public.studio2_permission_state_versions (user_id, version)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select state.version
  into v_version
  from public.studio2_permission_state_versions state
  where state.user_id = p_user_id;

  return coalesce(v_version, 0);
end
$permver$;

create or replace function private.studio2_lock_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permlock$
declare
  v_version bigint;
begin
  perform private.studio2_ensure_permission_version(p_user_id);

  select state.version
  into v_version
  from public.studio2_permission_state_versions state
  where state.user_id = p_user_id
  for update;

  return v_version;
end
$permlock$;

create or replace function private.studio2_bump_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permbump$
declare
  v_version bigint;
begin
  perform private.studio2_ensure_permission_version(p_user_id);

  update public.studio2_permission_state_versions
  set
    version = version + 1,
    updated_at = now()
  where user_id = p_user_id
  returning version into v_version;

  return v_version;
end
$permbump$;

revoke all on function private.studio2_ensure_permission_version(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_lock_permission_version(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_bump_permission_version(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_permission_state_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $permtrigger$
begin
  if tg_op = 'DELETE' then
    perform private.studio2_bump_permission_version(old.user_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform private.studio2_bump_permission_version(old.user_id);
  end if;

  perform private.studio2_bump_permission_version(new.user_id);
  return new;
end
$permtrigger$;

revoke all on function private.studio2_permission_state_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_role_assignment_version_bump
  on public.studio2_role_assignments;
create trigger studio2_role_assignment_version_bump
after insert or update or delete on public.studio2_role_assignments
for each row execute function private.studio2_permission_state_version_trigger();

drop trigger if exists studio2_capability_grant_version_bump
  on public.studio2_capability_grants;
create trigger studio2_capability_grant_version_bump
after insert or update or delete on public.studio2_capability_grants
for each row execute function private.studio2_permission_state_version_trigger();

create or replace function private.studio2_validate_permission_change(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permvalidate$
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;

  if p_change_kind not in (
    'assign_role',
    'revoke_role',
    'grant_capability',
    'revoke_capability'
  ) then
    raise exception 'Unknown permission change kind: %', p_change_kind using errcode = '22023';
  end if;

  if p_change_kind in ('assign_role', 'revoke_role') then
    if not exists (select 1 from public.studio2_access_roles role where role.key = p_key) then
      raise exception 'Unknown Solaris access role: %', p_key using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.studio2_capabilities capability where capability.key = p_key) then
      raise exception 'Unknown Solaris capability: %', p_key using errcode = '22023';
    end if;
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;

  if p_change_kind in ('revoke_role', 'revoke_capability') and p_expires_at is not null then
    raise exception 'Revocation commands cannot set an expiry' using errcode = '22023';
  end if;
end
$permvalidate$;

revoke all on function private.studio2_validate_permission_change(uuid, text, text, timestamptz)
  from public, anon, authenticated;

create or replace function private.studio2_permission_change_capabilities(
  p_change_kind text,
  p_key text
)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $permcaps$
  select case
    when p_change_kind in ('assign_role', 'revoke_role') then
      coalesce(
        (
          select array_agg(role_capability.capability order by role_capability.capability)
          from public.studio2_role_capabilities role_capability
          where role_capability.role_key = p_key
        ),
        array[]::text[]
      )
    else array[p_key]::text[]
  end;
$permcaps$;

revoke all on function private.studio2_permission_change_capabilities(text, text)
  from public, anon, authenticated;

create or replace function public.studio2_permission_change_preview(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permpreview$
declare
  v_actor uuid := auth.uid();
  v_version bigint;
  v_display_name text;
  v_capabilities text[];
  v_already_applied boolean := false;
  v_affects_permission_admin boolean := false;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    p_change_kind,
    p_key,
    p_expires_at
  );

  if p_edition_id is not null
     and not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Permission edition scope does not exist' using errcode = '22023';
  end if;

  v_version := private.studio2_ensure_permission_version(p_user_id);
  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);
  v_affects_permission_admin := 'permissions.manage' = any(v_capabilities);

  select coalesce(
    nullif(btrim(user_row.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'instagram_username'), ''),
    nullif(split_part(coalesce(user_row.email, ''), '@', 1), ''),
    'User'
  )
  into v_display_name
  from auth.users user_row
  where user_row.id = p_user_id;

  if p_change_kind = 'assign_role' then
    select exists (
      select 1
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id
        and assignment.expires_at is not distinct from p_expires_at
    ) into v_already_applied;
  elsif p_change_kind = 'revoke_role' then
    select not exists (
      select 1
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id
    ) into v_already_applied;
  elsif p_change_kind = 'grant_capability' then
    select exists (
      select 1
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id
        and grant_row.expires_at is not distinct from p_expires_at
    ) into v_already_applied;
  else
    select not exists (
      select 1
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id
    ) into v_already_applied;
  end if;

  return jsonb_build_object(
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'targetDisplayName', v_display_name,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'expiresAt', p_expires_at,
    'expectedVersion', v_version,
    'alreadyApplied', v_already_applied,
    'affectedCapabilities', to_jsonb(v_capabilities),
    'globalScope', p_edition_id is null,
    'grantsPermissionAdministration', v_affects_permission_admin,
    'warnings', jsonb_build_object(
      'globalScope',
        case
          when p_edition_id is null
            then 'This access change applies across every edition.'
          else null
        end,
      'permissionAdministration',
        case
          when v_affects_permission_admin
            then 'This change affects permission administration and can change who controls access.'
          else null
        end,
      'selfChange',
        case
          when v_actor = p_user_id
            then 'You are changing your own access. A mistake can remove your ability to recover permissions.'
          else null
        end
    )
  );
end
$permpreview$;

revoke all on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) to authenticated;

create or replace function public.studio2_apply_permission_change(
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
as $permapply$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint;
  v_next_version bigint;
  v_changed boolean := false;
  v_before jsonb;
  v_after jsonb;
  v_before_expires_at timestamptz;
  v_result jsonb;
  v_table_name text;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    p_change_kind,
    p_key,
    p_expires_at
  );

  if p_edition_id is not null
     and not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Permission edition scope does not exist' using errcode = '22023';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Expected access version is required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'permissions.access_change',
    'R3',
    jsonb_build_object(
      'targetUserId', p_user_id,
      'editionId', p_edition_id,
      'changeKind', p_change_kind,
      'key', p_key
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  v_current_version := private.studio2_lock_permission_version(p_user_id);
  if v_current_version <> p_expected_version then
    raise exception
      'Access changed since this impact preview was loaded. Reload the preview before applying the change.'
      using errcode = '40001';
  end if;

  if p_change_kind = 'assign_role' then
    v_table_name := 'studio2_role_assignments';

    select to_jsonb(assignment), assignment.expires_at
    into v_before, v_before_expires_at
    from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;

    if v_before is null
       or v_before_expires_at is distinct from p_expires_at then
      insert into public.studio2_role_assignments (
        user_id,
        role_key,
        edition_id,
        expires_at,
        assigned_by
      )
      values (
        p_user_id,
        p_key,
        p_edition_id,
        p_expires_at,
        v_actor
      )
      on conflict (user_id, role_key, edition_id)
      do update set
        expires_at = excluded.expires_at,
        assigned_by = excluded.assigned_by;

      select to_jsonb(assignment)
      into v_after
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id;

      v_changed := true;
    else
      v_after := v_before;
    end if;

  elsif p_change_kind = 'revoke_role' then
    v_table_name := 'studio2_role_assignments';

    select to_jsonb(assignment)
    into v_before
    from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;

    delete from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;

    v_changed := found;
    v_after := null;

  elsif p_change_kind = 'grant_capability' then
    v_table_name := 'studio2_capability_grants';
    v_before_expires_at := null;

    select to_jsonb(grant_row), grant_row.expires_at
    into v_before, v_before_expires_at
    from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;

    if v_before is null
       or v_before_expires_at is distinct from p_expires_at then
      insert into public.studio2_capability_grants (
        user_id,
        capability,
        edition_id,
        expires_at,
        granted_by
      )
      values (
        p_user_id,
        p_key,
        p_edition_id,
        p_expires_at,
        v_actor
      )
      on conflict (user_id, capability, edition_id)
      do update set
        expires_at = excluded.expires_at,
        granted_by = excluded.granted_by;

      select to_jsonb(grant_row)
      into v_after
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id;

      v_changed := true;
    else
      v_after := v_before;
    end if;

  else
    v_table_name := 'studio2_capability_grants';

    select to_jsonb(grant_row)
    into v_before
    from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;

    delete from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;

    v_changed := found;
    v_after := null;
  end if;

  if v_changed then
    select state.version
    into v_next_version
    from public.studio2_permission_state_versions state
    where state.user_id = p_user_id;

    insert into public.admin_audit_log (
      actor_id,
      action,
      table_name,
      record_id,
      edition_id,
      before_data,
      after_data
    )
    values (
      v_actor,
      'permission_' || p_change_kind,
      v_table_name,
      p_user_id::text || ':' || p_key,
      p_edition_id,
      v_before,
      coalesce(
        v_after,
        jsonb_build_object(
          'user_id', p_user_id,
          'key', p_key,
          'edition_id', p_edition_id,
          'removed', true
        )
      )
    );
  else
    v_next_version := v_current_version;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'previousVersion', v_current_version,
    'version', v_next_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$permapply$;

revoke all on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to authenticated;

-- Legacy mutation RPCs remain available only to trusted service automation.
-- Browser admins must pass through the R3 preview + operation receipt flow.
create or replace function public.studio2_grant_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns public.studio2_capability_grants
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacygrant$
declare
  v_grant public.studio2_capability_grants%rowtype;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Use the governed R3 permission change command'
      using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    'grant_capability',
    p_capability,
    p_expires_at
  );

  insert into public.studio2_capability_grants (
    user_id,
    capability,
    edition_id,
    expires_at,
    granted_by
  )
  values (
    p_user_id,
    p_capability,
    p_edition_id,
    p_expires_at,
    auth.uid()
  )
  on conflict (user_id, capability, edition_id)
  do update set
    expires_at = excluded.expires_at,
    granted_by = excluded.granted_by
  returning * into v_grant;

  return v_grant;
end
$legacygrant$;

create or replace function public.studio2_revoke_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacyrevoke$
declare
  v_changed boolean;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Use the governed R3 permission change command'
      using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    'revoke_capability',
    p_capability,
    null
  );

  delete from public.studio2_capability_grants
  where user_id = p_user_id
    and capability = p_capability
    and edition_id is not distinct from p_edition_id;

  v_changed := found;
  return v_changed;
end
$legacyrevoke$;

create or replace function public.studio2_assign_access_role(
  p_user_id uuid,
  p_role_key text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns public.studio2_role_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacyrole$
declare
  v_assignment public.studio2_role_assignments%rowtype;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Use the governed R3 permission change command'
      using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    'assign_role',
    p_role_key,
    p_expires_at
  );

  insert into public.studio2_role_assignments (
    user_id,
    role_key,
    edition_id,
    expires_at,
    assigned_by
  )
  values (
    p_user_id,
    p_role_key,
    p_edition_id,
    p_expires_at,
    auth.uid()
  )
  on conflict (user_id, role_key, edition_id)
  do update set
    expires_at = excluded.expires_at,
    assigned_by = excluded.assigned_by
  returning * into v_assignment;

  return v_assignment;
end
$legacyrole$;

create or replace function public.studio2_revoke_access_role(
  p_user_id uuid,
  p_role_key text,
  p_edition_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacyrolerevoke$
declare
  v_changed boolean;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Use the governed R3 permission change command'
      using errcode = '42501';
  end if;

  perform private.studio2_validate_permission_change(
    p_user_id,
    'revoke_role',
    p_role_key,
    null
  );

  delete from public.studio2_role_assignments
  where user_id = p_user_id
    and role_key = p_role_key
    and edition_id is not distinct from p_edition_id;

  v_changed := found;
  return v_changed;
end
$legacyrolerevoke$;

revoke all on function public.studio2_grant_capability(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.studio2_revoke_capability(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.studio2_assign_access_role(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.studio2_revoke_access_role(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.studio2_grant_capability(uuid, text, uuid, timestamptz)
  to service_role;
grant execute on function public.studio2_revoke_capability(uuid, text, uuid)
  to service_role;
grant execute on function public.studio2_assign_access_role(uuid, text, uuid, timestamptz)
  to service_role;
grant execute on function public.studio2_revoke_access_role(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
