begin;

-- Organisation OS V5: permission changes are R3 operations.
--
-- The previous Permission Engine correctly enforced capabilities, but its grant
-- and revoke RPCs were direct mutations. V5 requires an impact preview,
-- optimistic concurrency, idempotent replay, and an immutable operation receipt
-- for high-impact access changes.

create table if not exists public.studio2_permission_subject_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_permission_subject_versions enable row level security;
revoke all on table public.studio2_permission_subject_versions from public, anon, authenticated;
grant all on table public.studio2_permission_subject_versions to service_role;

create or replace function private.studio2_touch_permission_subject_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  insert into public.studio2_permission_subject_versions (user_id, version, updated_at)
  values (v_user_id, 1, now())
  on conflict (user_id) do update
  set version = public.studio2_permission_subject_versions.version + 1,
      updated_at = excluded.updated_at;

  if tg_op = 'UPDATE'
     and old.user_id is distinct from new.user_id then
    insert into public.studio2_permission_subject_versions (user_id, version, updated_at)
    values (old.user_id, 1, now())
    on conflict (user_id) do update
    set version = public.studio2_permission_subject_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_permission_subject_version()
  from public, anon, authenticated;

drop trigger if exists studio2_role_assignments_touch_subject_version
  on public.studio2_role_assignments;
create trigger studio2_role_assignments_touch_subject_version
after insert or update or delete on public.studio2_role_assignments
for each row execute function private.studio2_touch_permission_subject_version();

drop trigger if exists studio2_capability_grants_touch_subject_version
  on public.studio2_capability_grants;
create trigger studio2_capability_grants_touch_subject_version
after insert or update or delete on public.studio2_capability_grants
for each row execute function private.studio2_touch_permission_subject_version();

create or replace function private.studio2_permission_subject_snapshot(
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
  select jsonb_build_object(
    'roles',
    coalesce((
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
        and (assignment.expires_at is null or assignment.expires_at > now())
    ), '[]'::jsonb),
    'directCapabilities',
    coalesce((
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
        and (grant_row.expires_at is null or grant_row.expires_at > now())
    ), '[]'::jsonb)
  )
$snapshot$;

revoke all on function private.studio2_permission_subject_snapshot(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_permission_change_capabilities(
  p_change_kind text,
  p_key text
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $caps$
declare
  v_capabilities text[];
begin
  if p_change_kind in ('assign_role', 'revoke_role') then
    if not exists (
      select 1
      from public.studio2_access_roles role_row
      where role_row.key = p_key
    ) then
      raise exception 'Unknown access role: %', p_key using errcode = '22023';
    end if;

    select coalesce(array_agg(rc.capability order by rc.capability), array[]::text[])
    into v_capabilities
    from public.studio2_role_capabilities rc
    where rc.role_key = p_key;

    return v_capabilities;
  end if;

  if p_change_kind in ('grant_capability', 'revoke_capability') then
    if not exists (
      select 1
      from public.studio2_capabilities capability_row
      where capability_row.key = p_key
    ) then
      raise exception 'Unknown Solaris capability: %', p_key using errcode = '22023';
    end if;
    return array[p_key]::text[];
  end if;

  raise exception 'Unsupported permission change: %', p_change_kind
    using errcode = '22023';
end
$caps$;

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
as $preview$
declare
  v_actor uuid := auth.uid();
  v_version bigint := 0;
  v_display_name text;
  v_capabilities text[];
  v_already_applied boolean := false;
  v_grants_permission_admin boolean := false;
  v_global_scope boolean := p_edition_id is null;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user was not found' using errcode = 'P0002';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;

  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);

  select coalesce((
    select subject.version
    from public.studio2_permission_subject_versions subject
    where subject.user_id = p_user_id
  ), 0)
  into v_version;

  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'instagram_username'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'User'
  )
  into v_display_name
  from auth.users u
  where u.id = p_user_id;

  if p_change_kind = 'assign_role' then
    v_already_applied := exists (
      select 1 from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and a.role_key = p_key
        and a.edition_id is not distinct from p_edition_id
        and (a.expires_at is null or a.expires_at > now())
    );
  elsif p_change_kind = 'revoke_role' then
    v_already_applied := not exists (
      select 1 from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and a.role_key = p_key
        and a.edition_id is not distinct from p_edition_id
    );
  elsif p_change_kind = 'grant_capability' then
    v_already_applied := exists (
      select 1 from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_key
        and g.edition_id is not distinct from p_edition_id
        and (g.expires_at is null or g.expires_at > now())
    );
  elsif p_change_kind = 'revoke_capability' then
    v_already_applied := not exists (
      select 1 from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_key
        and g.edition_id is not distinct from p_edition_id
    );
  end if;

  v_grants_permission_admin := 'permissions.manage' = any(v_capabilities);

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
    'globalScope', v_global_scope,
    'grantsPermissionAdministration', v_grants_permission_admin,
    'warnings',
      jsonb_strip_nulls(jsonb_build_object(
        'globalScope',
          case when v_global_scope
            then 'This access change applies across every edition.'
            else null end,
        'permissionAdministration',
          case when v_grants_permission_admin
            then 'This change affects the ability to administer Solaris permissions.'
            else null end,
        'selfChange',
          case when p_user_id = v_actor
            then 'You are changing your own effective access.'
            else null end
      ))
  );
end
$preview$;

revoke all on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) to authenticated, service_role;

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
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint;
  v_next_version bigint;
  v_before jsonb;
  v_after jsonb;
  v_changed boolean := false;
  v_result jsonb;
  v_capabilities text[];
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null or p_operation_id is null or p_expected_version is null then
    raise exception 'Target user, operation id and expected permission version are required'
      using errcode = '22023';
  end if;
  if p_expected_version < 0 then
    raise exception 'Expected permission version is invalid' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user was not found' using errcode = 'P0002';
  end if;

  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'permissions.' || p_change_kind,
    'R3',
    jsonb_build_object(
      'targetUserId', p_user_id,
      'editionId', p_edition_id,
      'key', p_key,
      'expectedVersion', p_expected_version,
      'affectedCapabilities', to_jsonb(v_capabilities)
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.studio2_permission_subject_versions (user_id, version)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select version
  into v_current_version
  from public.studio2_permission_subject_versions
  where user_id = p_user_id
  for update;

  if p_expected_version <> v_current_version then
    raise exception 'Access changed since this preview was loaded. Refresh the impact preview before continuing.'
      using errcode = '40001';
  end if;

  v_before := private.studio2_permission_subject_snapshot(p_user_id);

  if p_change_kind = 'assign_role' then
    insert into public.studio2_role_assignments (
      user_id, role_key, edition_id, expires_at, assigned_by
    ) values (
      p_user_id, p_key, p_edition_id, p_expires_at, v_actor
    )
    on conflict (user_id, role_key, edition_id)
    do update set
      expires_at = excluded.expires_at,
      assigned_by = excluded.assigned_by;
    v_changed := true;
  elsif p_change_kind = 'revoke_role' then
    delete from public.studio2_role_assignments
    where user_id = p_user_id
      and role_key = p_key
      and edition_id is not distinct from p_edition_id;
    v_changed := found;
  elsif p_change_kind = 'grant_capability' then
    insert into public.studio2_capability_grants (
      user_id, capability, edition_id, expires_at, granted_by
    ) values (
      p_user_id, p_key, p_edition_id, p_expires_at, v_actor
    )
    on conflict (user_id, capability, edition_id)
    do update set
      expires_at = excluded.expires_at,
      granted_by = excluded.granted_by;
    v_changed := true;
  elsif p_change_kind = 'revoke_capability' then
    delete from public.studio2_capability_grants
    where user_id = p_user_id
      and capability = p_key
      and edition_id is not distinct from p_edition_id;
    v_changed := found;
  else
    raise exception 'Unsupported permission change: %', p_change_kind
      using errcode = '22023';
  end if;

  select version
  into v_next_version
  from public.studio2_permission_subject_versions
  where user_id = p_user_id;

  if v_next_version is null then
    v_next_version := v_current_version;
  end if;

  v_after := private.studio2_permission_subject_snapshot(p_user_id);

  if v_changed then
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
      'permission_' || p_change_kind,
      'studio2_permission_subject',
      p_user_id::text,
      v_before,
      v_after
    );
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
$apply$;

revoke all on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to authenticated, service_role;

-- Authenticated organizers must use the V5 R3 command above. Keep the legacy
-- primitive RPCs available only to trusted service-role compatibility code.
revoke execute on function public.studio2_grant_capability(uuid, text, uuid, timestamptz)
  from authenticated;
revoke execute on function public.studio2_revoke_capability(uuid, text, uuid)
  from authenticated;
revoke execute on function public.studio2_assign_access_role(uuid, text, uuid, timestamptz)
  from authenticated;
revoke execute on function public.studio2_revoke_access_role(uuid, text, uuid)
  from authenticated;

notify pgrst, 'reload schema';

commit;
