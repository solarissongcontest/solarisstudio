begin;

-- Organisation OS V5: permission administration is a Risk R3 operation.
--
-- Every access mutation now has:
--   preview -> explicit confirmation -> operation/idempotency identity
--   -> expected access version -> server-authoritative apply -> audit receipt.
--
-- The old narrow mutation RPCs remain available to service_role for internal
-- migration/automation compatibility, but authenticated Organizer clients must
-- use the governed R3 command.

create table if not exists public.studio2_access_state_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_access_state_versions enable row level security;
revoke all on table public.studio2_access_state_versions from public, anon, authenticated;
grant all on table public.studio2_access_state_versions to service_role;

create or replace function private.studio2_bump_role_assignment_access_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $role_version$
declare
  v_old_user uuid;
  v_new_user uuid;
  v_semantic_change boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_semantic_change :=
      old.user_id is distinct from new.user_id
      or old.role_key is distinct from new.role_key
      or old.edition_id is distinct from new.edition_id
      or old.expires_at is distinct from new.expires_at;

    if not v_semantic_change then
      return new;
    end if;
  end if;

  v_old_user := case when tg_op in ('UPDATE', 'DELETE') then old.user_id else null end;
  v_new_user := case when tg_op in ('INSERT', 'UPDATE') then new.user_id else null end;

  if v_old_user is not null then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_old_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if v_new_user is not null and v_new_user is distinct from v_old_user then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_new_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$role_version$;

revoke all on function private.studio2_bump_role_assignment_access_version()
  from public, anon, authenticated;

drop trigger if exists studio2_role_assignments_access_version
  on public.studio2_role_assignments;
create trigger studio2_role_assignments_access_version
after insert or update or delete on public.studio2_role_assignments
for each row execute function private.studio2_bump_role_assignment_access_version();

create or replace function private.studio2_bump_capability_grant_access_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $grant_version$
declare
  v_old_user uuid;
  v_new_user uuid;
  v_semantic_change boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_semantic_change :=
      old.user_id is distinct from new.user_id
      or old.capability is distinct from new.capability
      or old.edition_id is distinct from new.edition_id
      or old.expires_at is distinct from new.expires_at;

    if not v_semantic_change then
      return new;
    end if;
  end if;

  v_old_user := case when tg_op in ('UPDATE', 'DELETE') then old.user_id else null end;
  v_new_user := case when tg_op in ('INSERT', 'UPDATE') then new.user_id else null end;

  if v_old_user is not null then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_old_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if v_new_user is not null and v_new_user is distinct from v_old_user then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_new_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$grant_version$;

revoke all on function private.studio2_bump_capability_grant_access_version()
  from public, anon, authenticated;

drop trigger if exists studio2_capability_grants_access_version
  on public.studio2_capability_grants;
create trigger studio2_capability_grants_access_version
after insert or update or delete on public.studio2_capability_grants
for each row execute function private.studio2_bump_capability_grant_access_version();

create or replace function private.studio2_bump_legacy_role_access_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacy_version$
declare
  v_old_user uuid;
  v_new_user uuid;
  v_semantic_change boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_semantic_change :=
      old.user_id is distinct from new.user_id
      or old.role is distinct from new.role;

    if not v_semantic_change then
      return new;
    end if;
  end if;

  v_old_user := case when tg_op in ('UPDATE', 'DELETE') then old.user_id else null end;
  v_new_user := case when tg_op in ('INSERT', 'UPDATE') then new.user_id else null end;

  if v_old_user is not null then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_old_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if v_new_user is not null and v_new_user is distinct from v_old_user then
    insert into public.studio2_access_state_versions (user_id, version, updated_at)
    values (v_new_user, 1, now())
    on conflict (user_id) do update
      set version = public.studio2_access_state_versions.version + 1,
          updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$legacy_version$;

revoke all on function private.studio2_bump_legacy_role_access_version()
  from public, anon, authenticated;

drop trigger if exists studio2_user_roles_access_version
  on public.user_roles;
create trigger studio2_user_roles_access_version
after insert or update or delete on public.user_roles
for each row execute function private.studio2_bump_legacy_role_access_version();

create or replace function private.studio2_access_state_version(
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $access_version$
  select coalesce(
    (
      select version
      from public.studio2_access_state_versions
      where user_id = p_user_id
    ),
    0
  );
$access_version$;

revoke all on function private.studio2_access_state_version(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_access_state_snapshot(
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
  select jsonb_build_object(
    'userId', p_user_id,
    'version', private.studio2_access_state_version(p_user_id),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'roleKey', assignment.role_key,
            'editionId', assignment.edition_id,
            'expiresAt', assignment.expires_at
          )
          order by assignment.role_key, assignment.edition_id nulls first
        )
        from public.studio2_role_assignments assignment
        where assignment.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'directGrants', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'capability', grant_row.capability,
            'editionId', grant_row.edition_id,
            'expiresAt', grant_row.expires_at
          )
          order by grant_row.capability, grant_row.edition_id nulls first
        )
        from public.studio2_capability_grants grant_row
        where grant_row.user_id = p_user_id
      ),
      '[]'::jsonb
    )
  );
$snapshot$;

revoke all on function private.studio2_access_state_snapshot(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_permission_change_capabilities(
  p_change_kind text,
  p_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $affected$
begin
  if p_change_kind in ('assign_role', 'revoke_role') then
    return coalesce(
      (
        select jsonb_agg(role_capability.capability order by role_capability.capability)
        from public.studio2_role_capabilities role_capability
        where role_capability.role_key = p_key
      ),
      '[]'::jsonb
    );
  end if;

  if p_change_kind in ('grant_capability', 'revoke_capability') then
    return jsonb_build_array(p_key);
  end if;

  raise exception 'Unsupported permission change kind: %', p_change_kind
    using errcode = '22023';
end
$affected$;

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
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_actor uuid := auth.uid();
  v_display_name text;
  v_affected jsonb;
  v_already_applied boolean := false;
  v_permissions_admin boolean := false;
  v_grants_permissions_admin boolean := false;
  v_expected_version bigint;
  v_warnings jsonb := '{}'::jsonb;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required'
      using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users user_row where user_row.id = p_user_id
  ) then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;

  if p_change_kind not in (
    'assign_role',
    'revoke_role',
    'grant_capability',
    'revoke_capability'
  ) then
    raise exception 'Unsupported permission change kind: %', p_change_kind
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_key, '')), '') is null then
    raise exception 'Permission change key is required' using errcode = '22023';
  end if;

  if p_change_kind in ('assign_role', 'revoke_role')
     and not exists (
       select 1
       from public.studio2_access_roles access_role
       where access_role.key = p_key
     ) then
    raise exception 'Unknown access role: %', p_key using errcode = '22023';
  end if;

  if p_change_kind in ('grant_capability', 'revoke_capability')
     and not exists (
       select 1
       from public.studio2_capabilities capability_row
       where capability_row.key = p_key
     ) then
    raise exception 'Unknown Solaris capability: %', p_key using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Access expiry must be in the future' using errcode = '22023';
  end if;

  select coalesce(
    nullif(btrim(user_row.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'instagram_username'), ''),
    split_part(coalesce(user_row.email, ''), '@', 1),
    'User'
  )
  into v_display_name
  from auth.users user_row
  where user_row.id = p_user_id;

  v_affected := private.studio2_permission_change_capabilities(p_change_kind, p_key);
  v_expected_version := private.studio2_access_state_version(p_user_id);

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

  select exists (
    select 1
    from jsonb_array_elements_text(v_affected) affected(capability)
    where affected.capability = 'permissions.manage'
  ) into v_permissions_admin;

  v_grants_permissions_admin :=
    v_permissions_admin
    and p_change_kind in ('assign_role', 'grant_capability');

  if p_edition_id is null then
    v_warnings := v_warnings || jsonb_build_object(
      'globalScope',
      'This change applies across every edition, including future operational work.'
    );
  end if;

  if v_permissions_admin then
    v_warnings := v_warnings || jsonb_build_object(
      'permissionAdministration',
      case
        when v_grants_permissions_admin then
          'This change grants permission-administration authority. The user may be able to change other users access.'
        else
          'This change removes permission-administration authority from the target access path.'
      end
    );
  end if;

  if p_user_id = v_actor then
    v_warnings := v_warnings || jsonb_build_object(
      'selfChange',
      'You are changing your own access. Removing permission administration can lock you out of this workspace.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'targetDisplayName', v_display_name,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'expiresAt', p_expires_at,
    'expectedVersion', v_expected_version,
    'alreadyApplied', v_already_applied,
    'affectedCapabilities', v_affected,
    'globalScope', p_edition_id is null,
    'grantsPermissionAdministration', v_grants_permissions_admin,
    'warnings', v_warnings
  );
end
$preview$;

revoke all on function public.studio2_permission_change_preview(
  uuid,
  text,
  text,
  uuid,
  timestamptz
) from public, anon;
grant execute on function public.studio2_permission_change_preview(
  uuid,
  text,
  text,
  uuid,
  timestamptz
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
as $apply$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint;
  v_previous_version bigint;
  v_after_version bigint;
  v_before jsonb;
  v_after jsonb;
  v_changed boolean := false;
  v_result jsonb;
  v_exists boolean;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required'
      using errcode = '42501';
  end if;

  if p_user_id is null
     or p_operation_id is null
     or p_expected_version is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Target user, operation id, idempotency key and expected version are required'
      using errcode = '22023';
  end if;

  if p_change_kind not in (
    'assign_role',
    'revoke_role',
    'grant_capability',
    'revoke_capability'
  ) then
    raise exception 'Unsupported permission change kind: %', p_change_kind
      using errcode = '22023';
  end if;

  if p_change_kind in ('assign_role', 'revoke_role')
     and not exists (
       select 1
       from public.studio2_access_roles access_role
       where access_role.key = p_key
     ) then
    raise exception 'Unknown access role: %', p_key using errcode = '22023';
  end if;

  if p_change_kind in ('grant_capability', 'revoke_capability')
     and not exists (
       select 1
       from public.studio2_capabilities capability_row
       where capability_row.key = p_key
     ) then
    raise exception 'Unknown Solaris capability: %', p_key using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Access expiry must be in the future' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'permissions.access.change',
    'R3',
    jsonb_build_object(
      'targetUserId', p_user_id,
      'editionId', p_edition_id,
      'changeKind', p_change_kind,
      'key', p_key,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.studio2_access_state_versions (user_id, version, updated_at)
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  select version
  into v_current_version
  from public.studio2_access_state_versions
  where user_id = p_user_id
  for update;

  if v_current_version is distinct from p_expected_version then
    raise exception
      'Access changed since this impact preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_previous_version := v_current_version;
  v_before := private.studio2_access_state_snapshot(p_user_id);

  if p_change_kind = 'assign_role' then
    select exists (
      select 1
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id
        and assignment.expires_at is not distinct from p_expires_at
    ) into v_exists;

    if not v_exists then
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
      v_changed := true;
    end if;

  elsif p_change_kind = 'revoke_role' then
    delete from public.studio2_role_assignments
    where user_id = p_user_id
      and role_key = p_key
      and edition_id is not distinct from p_edition_id;
    v_changed := found;

  elsif p_change_kind = 'grant_capability' then
    select exists (
      select 1
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id
        and grant_row.expires_at is not distinct from p_expires_at
    ) into v_exists;

    if not v_exists then
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
      v_changed := true;
    end if;

  else
    delete from public.studio2_capability_grants
    where user_id = p_user_id
      and capability = p_key
      and edition_id is not distinct from p_edition_id;
    v_changed := found;
  end if;

  select version
  into v_after_version
  from public.studio2_access_state_versions
  where user_id = p_user_id;

  if not v_changed then
    v_after_version := v_previous_version;
  end if;

  v_after := private.studio2_access_state_snapshot(p_user_id);

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'permissions_access_change',
    case
      when p_change_kind in ('assign_role', 'revoke_role')
        then 'studio2_role_assignments'
      else 'studio2_capability_grants'
    end,
    p_user_id::text,
    v_before || jsonb_build_object(
      'operationId', v_operation_id,
      'changeKind', p_change_kind,
      'key', p_key,
      'editionId', p_edition_id,
      'riskClass', 'R3'
    ),
    v_after || jsonb_build_object(
      'operationId', v_operation_id,
      'changeKind', p_change_kind,
      'key', p_key,
      'editionId', p_edition_id,
      'riskClass', 'R3'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'previousVersion', v_previous_version,
    'version', v_after_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_permission_change(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  uuid,
  text,
  bigint
) from public, anon;
grant execute on function public.studio2_apply_permission_change(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  uuid,
  text,
  bigint
) to authenticated;

-- Remove the old authenticated bypass. Internal service jobs can still use the
-- legacy narrow functions and their writes also bump the same access version.
revoke execute on function public.studio2_grant_capability(
  uuid,
  text,
  uuid,
  timestamptz
) from authenticated;
revoke execute on function public.studio2_revoke_capability(
  uuid,
  text,
  uuid
) from authenticated;
revoke execute on function public.studio2_assign_access_role(
  uuid,
  text,
  uuid,
  timestamptz
) from authenticated;
revoke execute on function public.studio2_revoke_access_role(
  uuid,
  text,
  uuid
) from authenticated;

grant execute on function public.studio2_grant_capability(
  uuid,
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.studio2_revoke_capability(
  uuid,
  text,
  uuid
) to service_role;
grant execute on function public.studio2_assign_access_role(
  uuid,
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.studio2_revoke_access_role(
  uuid,
  text,
  uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
