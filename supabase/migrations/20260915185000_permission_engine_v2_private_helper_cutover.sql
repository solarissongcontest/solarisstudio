begin;

-- Permission Engine v2 cutover batch 4.
--
-- Centralize the remaining private Studio 2 legacy Organizer/capability fallback
-- without changing each helper's existing domain capability mapping or its
-- pre-cutover OR semantics. Once Permission Engine v2 becomes globally
-- authoritative, the shared predicate automatically ignores legacy roles.

create or replace function private.studio2_user_access_allowed(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_capability_allowed boolean;
  v_legacy_allowed boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  v_capability_allowed := private.studio2_user_has_capability(
    p_user_id,
    p_capability,
    p_edition_id
  );

  if private.studio2_permission_engine_authoritative() then
    return v_capability_allowed;
  end if;

  v_legacy_allowed := public.has_role(p_user_id, 'organizer'::public.app_role);

  if p_strict_before_cutover then
    return v_legacy_allowed and v_capability_allowed;
  end if;

  return v_legacy_allowed or v_capability_allowed;
end
$$;

revoke all on function private.studio2_user_access_allowed(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.studio2_user_access_allowed(uuid, text, uuid, boolean)
  to service_role;

create or replace function private.studio2_can_manage_broadcast(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_access_allowed(
    p_user_id,
    'edition.manage',
    p_edition_id,
    false
  )
$$;

create or replace function private.studio2_can_manage_eligibility(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_access_allowed(
    p_user_id,
    'entry.approve',
    p_edition_id,
    false
  )
$$;

create or replace function private.studio2_can_manage_host(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.studio2_user_access_allowed(p_user_id, 'host.manage', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'edition.manage', p_edition_id, false)
$$;

create or replace function private.studio2_can_manage_media_assets(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_access_allowed(
    p_user_id,
    'entry.approve',
    p_edition_id,
    false
  )
$$;

create or replace function private.studio2_can_manage_permissions(
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_access_allowed(
    p_user_id,
    'permissions.manage',
    null,
    false
  )
$$;

create or replace function private.studio2_can_manage_storytelling(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.studio2_user_access_allowed(p_user_id, 'story.manage', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'edition.manage', p_edition_id, false)
$$;

create or replace function private.studio2_can_preview_results(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.studio2_user_access_allowed(p_user_id, 'results.preview', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'results.verify', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'results.publish', p_edition_id, false)
$$;

create or replace function private.studio2_can_read_host(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.studio2_user_access_allowed(p_user_id, 'host.read', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'host.manage', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'edition.manage', p_edition_id, false)
$$;

create or replace function private.studio2_can_read_storytelling(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    private.studio2_user_access_allowed(p_user_id, 'story.read', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'story.manage', p_edition_id, false)
    or private.studio2_user_access_allowed(p_user_id, 'edition.manage', p_edition_id, false)
$$;

create or replace function private.studio2_can_verify_results(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_access_allowed(
    p_user_id,
    'results.verify',
    p_edition_id,
    false
  )
$$;

create or replace function private.studio2_feature_enabled_for(
  p_user_id uuid,
  p_key text,
  p_edition_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce((
    select
      f.enabled
      and (
        not f.admins_only
        or private.studio2_user_access_allowed(
          p_user_id,
          'rollout.read',
          p_edition_id,
          false
        )
      )
      and (
        cardinality(f.user_ids) = 0
        or (p_user_id is not null and p_user_id = any(f.user_ids))
      )
      and (
        cardinality(f.edition_ids) = 0
        or (p_edition_id is not null and p_edition_id = any(f.edition_ids))
      )
    from public.studio2_feature_flags f
    where f.key = p_key
  ), false)
$$;

create or replace function private.studio2_require_communications_access(
  p_edition_id uuid
) returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  v_is_service boolean := v_request_role = 'service_role';
begin
  if not v_is_service
     and not private.studio2_user_access_allowed(
       v_actor,
       'communications.send',
       p_edition_id,
       false
     ) then
    raise exception 'Missing Solaris capability: communications.send' using errcode = '42501';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
