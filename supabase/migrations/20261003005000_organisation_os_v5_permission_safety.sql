begin;

-- Organisation OS V5: R3 permission mutation safety.
--
-- Access changes are among the highest-risk Organizer actions. Authenticated
-- administrators must preview a target user's current access version, confirm
-- the impact, then submit one idempotent R3 command against that exact version.
-- Legacy direct mutation RPCs remain available only to service_role automation.

create table if not exists public.studio2_permission_subject_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.studio2_permission_subject_versions enable row level security;
revoke all on table public.studio2_permission_subject_versions
  from public, anon, authenticated;
grant all on table public.studio2_permission_subject_versions to service_role;

insert into public.studio2_permission_subject_versions (user_id)
select distinct source.user_id
from (
  select assignment.user_id
  from public.studio2_role_assignments assignment
  union
  select grant_row.user_id
  from public.studio2_capability_grants grant_row
) source
where source.user_id is not null
on conflict (user_id) do nothing;

create or replace function private.studio2_bump_permission_subject_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $version$
declare
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  if v_user_id is not null then
    insert into public.studio2_permission_subject_versions as subject_version (
      user_id,
      version,
      updated_at
    )
    values (
      v_user_id,
      2,
      now()
    )
    on conflict (user_id) do update set
      version = subject_version.version + 1,
      updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$version$;

revoke all on function private.studio2_bump_permission_subject_version()
  from public, anon, authenticated;

drop trigger if exists studio2_role_assignment_version_bump
  on public.studio2_role_assignments;
create trigger studio2_role_assignment_version_bump
after insert or update or delete on public.studio2_role_assignments
for each row execute function private.studio2_bump_permission_subject_version();

drop trigger if exists studio2_capability_grant_version_bump
  on public.studio2_capability_grants;
create trigger studio2_capability_grant_version_bump
after insert or update or delete on public.studio2_capability_grants
for each row execute function private.studio2_bump_permission_subject_version();

create or replace function private.studio2_permission_target_label(
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, auth
as $label$
  select coalesce(
    nullif(btrim(user_row.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'instagram_username'), ''),
    split_part(coalesce(user_row.email, ''), '@', 1),
    'User'
  )
  from auth.users user_row
  where user_row.id = p_user_id;
$label$;

revoke all on function private.studio2_permission_target_label(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_permission_change_capabilities(
  p_change_kind text,
  p_key text
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $caps$
declare
  v_capabilities text[];
begin
  if p_change_kind in ('assign_role', 'revoke_role') then
    select coalesce(array_agg(role_capability.capability order by role_capability.capability), array[]::text[])
    into v_capabilities
    from public.studio2_role_capabilities role_capability
    where role_capability.role_key = p_key;

    if not exists (
      select 1
      from public.studio2_access_roles role_row
      where role_row.key = p_key
    ) then
      raise exception 'Unknown Solaris access role: %', p_key using errcode = '22023';
    end if;
  elsif p_change_kind in ('grant_capability', 'revoke_capability') then
    if not exists (
      select 1
      from public.studio2_capabilities capability_row
      where capability_row.key = p_key
    ) then
      raise exception 'Unknown Solaris capability: %', p_key using errcode = '22023';
    end if;
    v_capabilities := array[p_key];
  else
    raise exception 'Unknown permission change kind: %', p_change_kind using errcode = '22023';
  end if;

  return coalesce(v_capabilities, array[]::text[]);
end
$caps$;

revoke all on function private.studio2_permission_change_capabilities(text, text)
  from public, anon, authenticated;

create or replace function private.studio2_permission_change_already_applied(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $applied$
begin
  if p_change_kind = 'assign_role' then
    return exists (
      select 1
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id
        and assignment.expires_at is not distinct from p_expires_at
    );
  elsif p_change_kind = 'revoke_role' then
    return not exists (
      select 1
      from public.studio2_role_assignments assignment
      where assignment.user_id = p_user_id
        and assignment.role_key = p_key
        and assignment.edition_id is not distinct from p_edition_id
    );
  elsif p_change_kind = 'grant_capability' then
    return exists (
      select 1
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id
        and grant_row.expires_at is not distinct from p_expires_at
    );
  elsif p_change_kind = 'revoke_capability' then
    return not exists (
      select 1
      from public.studio2_capability_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.capability = p_key
        and grant_row.edition_id is not distinct from p_edition_id
    );
  end if;

  raise exception 'Unknown permission change kind: %', p_change_kind using errcode = '22023';
end
$applied$;

revoke all on function private.studio2_permission_change_already_applied(
  uuid, text, text, uuid, timestamptz
) from public, anon, authenticated;

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
  v_target_label text;
  v_version bigint;
  v_capabilities text[];
  v_already_applied boolean;
  v_permission_admin boolean;
  v_warnings jsonb := '{}'::jsonb;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users user_row where user_row.id = p_user_id
  ) then
    raise exception 'A valid permission target user is required' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;

  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);
  v_already_applied := private.studio2_permission_change_already_applied(
    p_user_id,
    p_change_kind,
    p_key,
    p_edition_id,
    p_expires_at
  );

  insert into public.studio2_permission_subject_versions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select subject_version.version
  into v_version
  from public.studio2_permission_subject_versions subject_version
  where subject_version.user_id = p_user_id;

  v_target_label := private.studio2_permission_target_label(p_user_id);
  v_permission_admin :=
    'permissions.manage' = any(v_capabilities)
    or 'permissions.audit' = any(v_capabilities);

  if p_edition_id is null then
    v_warnings := v_warnings || jsonb_build_object(
      'globalScope',
      'This change applies across every edition.'
    );
  end if;

  if v_permission_admin then
    v_warnings := v_warnings || jsonb_build_object(
      'permissionAdministration',
      'This change affects permission-administration capabilities.'
    );
  end if;

  if p_user_id = v_actor then
    v_warnings := v_warnings || jsonb_build_object(
      'selfChange',
      'You are changing your own access. Confirm that another authorized administrator can recover access if needed.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'targetDisplayName', coalesce(v_target_label, 'User'),
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'expiresAt', p_expires_at,
    'expectedVersion', v_version,
    'alreadyApplied', v_already_applied,
    'affectedCapabilities', to_jsonb(v_capabilities),
    'globalScope', p_edition_id is null,
    'grantsPermissionAdministration', v_permission_admin,
    'warnings', v_warnings
  );
end
$preview$;

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
  p_edition_id uuid default null,
  p_expires_at timestamptz default null,
  p_operation_id uuid default null,
  p_idempotency_key text default null,
  p_expected_version bigint default null
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
  v_version_row public.studio2_permission_subject_versions;
  v_previous_version bigint;
  v_next_version bigint;
  v_changed boolean := false;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_result jsonb;
  v_capabilities text[];
  v_existing_expiry timestamptz;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users user_row where user_row.id = p_user_id
  ) then
    raise exception 'A valid permission target user is required' using errcode = '22023';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected permission access version is required' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;

  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'permissions.' || p_change_kind,
    'R3',
    jsonb_build_object(
      'userId', p_user_id,
      'editionId', p_edition_id,
      'key', p_key
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.studio2_permission_subject_versions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_version_row
  from public.studio2_permission_subject_versions subject_version
  where subject_version.user_id = p_user_id
  for update;

  v_previous_version := v_version_row.version;

  if v_previous_version <> p_expected_version then
    raise exception
      'Permission access changed after preview. Expected version %, current version %.',
      p_expected_version,
      v_previous_version
      using errcode = '40001';
  end if;

  if p_change_kind = 'assign_role' then
    select assignment.expires_at
    into v_existing_expiry
    from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;

    v_before := jsonb_build_object(
      'exists', found,
      'roleKey', p_key,
      'editionId', p_edition_id,
      'expiresAt', v_existing_expiry
    );

    if not found or v_existing_expiry is distinct from p_expires_at then
      insert into public.studio2_role_assignments (
        user_id, role_key, edition_id, expires_at, assigned_by
      ) values (
        p_user_id, p_key, p_edition_id, p_expires_at, v_actor
      )
      on conflict (user_id, role_key, edition_id)
      do update set
        expires_at = excluded.expires_at,
        assigned_by = excluded.assigned_by
      returning true into v_changed;
    end if;

    v_after := jsonb_build_object(
      'exists', true,
      'roleKey', p_key,
      'editionId', p_edition_id,
      'expiresAt', p_expires_at
    );

  elsif p_change_kind = 'revoke_role' then
    select assignment.expires_at
    into v_existing_expiry
    from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;

    v_before := jsonb_build_object(
      'exists', found,
      'roleKey', p_key,
      'editionId', p_edition_id,
      'expiresAt', v_existing_expiry
    );

    delete from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = p_key
      and assignment.edition_id is not distinct from p_edition_id;
    v_changed := found;

    v_after := jsonb_build_object(
      'exists', false,
      'roleKey', p_key,
      'editionId', p_edition_id
    );

  elsif p_change_kind = 'grant_capability' then
    select grant_row.expires_at
    into v_existing_expiry
    from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;

    v_before := jsonb_build_object(
      'exists', found,
      'capability', p_key,
      'editionId', p_edition_id,
      'expiresAt', v_existing_expiry
    );

    if not found or v_existing_expiry is distinct from p_expires_at then
      insert into public.studio2_capability_grants (
        user_id, capability, edition_id, expires_at, granted_by
      ) values (
        p_user_id, p_key, p_edition_id, p_expires_at, v_actor
      )
      on conflict (user_id, capability, edition_id)
      do update set
        expires_at = excluded.expires_at,
        granted_by = excluded.granted_by
      returning true into v_changed;
    end if;

    v_after := jsonb_build_object(
      'exists', true,
      'capability', p_key,
      'editionId', p_edition_id,
      'expiresAt', p_expires_at
    );

  elsif p_change_kind = 'revoke_capability' then
    select grant_row.expires_at
    into v_existing_expiry
    from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;

    v_before := jsonb_build_object(
      'exists', found,
      'capability', p_key,
      'editionId', p_edition_id,
      'expiresAt', v_existing_expiry
    );

    delete from public.studio2_capability_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_key
      and grant_row.edition_id is not distinct from p_edition_id;
    v_changed := found;

    v_after := jsonb_build_object(
      'exists', false,
      'capability', p_key,
      'editionId', p_edition_id
    );
  else
    raise exception 'Unknown permission change kind: %', p_change_kind using errcode = '22023';
  end if;

  if v_changed then
    select subject_version.version
    into v_next_version
    from public.studio2_permission_subject_versions subject_version
    where subject_version.user_id = p_user_id;

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
      'permission_r3_' || p_change_kind,
      case
        when p_change_kind in ('assign_role', 'revoke_role')
          then 'studio2_role_assignments'
        else 'studio2_capability_grants'
      end,
      p_user_id::text,
      v_before || jsonb_build_object(
        'accessVersion', v_previous_version,
        'affectedCapabilities', to_jsonb(v_capabilities)
      ),
      v_after || jsonb_build_object(
        'accessVersion', v_next_version,
        'operationId', v_operation_id,
        'affectedCapabilities', to_jsonb(v_capabilities)
      )
    );
  else
    v_next_version := v_previous_version;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'previousVersion', v_previous_version,
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
) to authenticated;

-- Authenticated clients must use the R3 preview/apply contract. The legacy
-- direct mutation functions remain available only for trusted service-role
-- automation that does not originate from Organizer UI.
revoke all on function public.studio2_grant_capability(
  uuid, text, uuid, timestamptz
) from authenticated;
revoke all on function public.studio2_revoke_capability(
  uuid, text, uuid
) from authenticated;
revoke all on function public.studio2_assign_access_role(
  uuid, text, uuid, timestamptz
) from authenticated;
revoke all on function public.studio2_revoke_access_role(
  uuid, text, uuid
) from authenticated;

grant execute on function public.studio2_grant_capability(
  uuid, text, uuid, timestamptz
) to service_role;
grant execute on function public.studio2_revoke_capability(
  uuid, text, uuid
) to service_role;
grant execute on function public.studio2_assign_access_role(
  uuid, text, uuid, timestamptz
) to service_role;
grant execute on function public.studio2_revoke_access_role(
  uuid, text, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
