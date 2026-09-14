begin;

-- Permission Engine v2 dual-enforcement batch 1.
-- Legacy organizer and country-owner decisions remain valid while capability
-- decisions are added to the last Studio 2 write RPCs that were legacy-only.

create or replace function private.studio2_feature_enabled_for(
  p_user_id uuid,
  p_key text,
  p_edition_id uuid default null
)
returns boolean
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
        or public.has_role(p_user_id, 'organizer'::public.app_role)
        or private.studio2_user_has_capability(p_user_id, 'rollout.read', p_edition_id)
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

create or replace function private.studio2_guard_jury_member_user_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if new.member_user_id is not null
     and not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not public.studio2_has_capability('jury.ballots.manage', new.edition_id) then
    raise exception 'Jury ballot management capability required to link an authenticated user'
      using errcode = '42501';
  end if;

  return new;
end
$$;

create or replace function public.studio2_assign_jury_member(
  p_edition_id uuid,
  p_country_id uuid,
  p_display_name text,
  p_member_user_id uuid default null
)
returns public.studio2_jury_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_required integer;
  v_assigned integer;
  v_member public.studio2_jury_members%rowtype;
begin
  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Jury member display name is required' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'jury.ballots.manage', p_edition_id)
     and not public.owns_country(v_actor, p_country_id) then
    raise exception 'Country ownership or jury ballot management capability required'
      using errcode = '42501';
  end if;

  perform 1 from public.editions e where e.id = p_edition_id for share;
  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_edition_id::text || ':' || p_country_id::text, 0));

  select coalesce(s.jury_members_required, 5)
  into v_required
  from (select 1) seed
  left join public.studio2_delegation_settings s
    on s.edition_id = p_edition_id and s.country_id = p_country_id;

  select count(*) into v_assigned
  from public.studio2_jury_members jm
  where jm.edition_id = p_edition_id
    and jm.country_id = p_country_id
    and jm.status = 'assigned';

  if v_assigned >= v_required then
    raise exception 'Delegation jury roster is already full (%/% members)', v_assigned, v_required
      using errcode = '23514';
  end if;

  insert into public.studio2_jury_members (
    edition_id, country_id, display_name, member_user_id, assigned_by
  ) values (
    p_edition_id, p_country_id, btrim(p_display_name), p_member_user_id, v_actor
  )
  returning * into v_member;

  return v_member;
end
$$;

create or replace function public.studio2_remove_jury_member(p_member_id uuid)
returns public.studio2_jury_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_member public.studio2_jury_members%rowtype;
begin
  select * into v_member
  from public.studio2_jury_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Jury member not found: %', p_member_id using errcode = 'P0002';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'jury.ballots.manage', v_member.edition_id)
     and not public.owns_country(v_actor, v_member.country_id) then
    raise exception 'Country ownership or jury ballot management capability required'
      using errcode = '42501';
  end if;

  if v_member.status = 'removed' then
    return v_member;
  end if;

  update public.studio2_jury_members
  set status = 'removed', removed_at = now(), removed_by = v_actor
  where id = p_member_id
  returning * into v_member;

  return v_member;
end
$$;

create or replace function public.studio2_set_feature_flag(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean default false,
  p_user_ids uuid[] default '{}'::uuid[],
  p_edition_ids uuid[] default '{}'::uuid[]
)
returns public.studio2_feature_flags
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_can_manage_scopes boolean := false;
  v_existing_scopes uuid[];
  v_requested_scopes uuid[] := coalesce(p_edition_ids, '{}'::uuid[]);
  v_row public.studio2_feature_flags%rowtype;
begin
  if p_key is null then
    raise exception 'Feature flag key is required' using errcode = '22023';
  end if;
  if array_position(coalesce(p_user_ids, '{}'::uuid[]), null) is not null
     or array_position(coalesce(p_edition_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Feature flag scopes may not contain null identifiers' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2_feature_flag:' || p_key, 0));

  select edition_ids
  into v_existing_scopes
  from public.studio2_feature_flags
  where key = p_key
  for update;

  if (found and cardinality(v_existing_scopes) = 0)
     or cardinality(v_requested_scopes) = 0 then
    v_can_manage_scopes := private.studio2_user_has_capability(v_actor, 'rollout.manage', null);
  else
    v_can_manage_scopes := not exists (
      select 1
      from (
        select distinct edition_id
        from unnest(coalesce(v_existing_scopes, '{}'::uuid[]) || v_requested_scopes)
          edition_scope(edition_id)
      ) affected_scope
      where not private.studio2_user_has_capability(v_actor, 'rollout.manage', affected_scope.edition_id)
    );
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not v_can_manage_scopes then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

  insert into public.studio2_feature_flags (
    key, enabled, admins_only, user_ids, edition_ids, updated_by
  ) values (
    p_key,
    coalesce(p_enabled, false),
    coalesce(p_admins_only, false),
    coalesce(p_user_ids, '{}'::uuid[]),
    coalesce(p_edition_ids, '{}'::uuid[]),
    v_actor
  )
  on conflict (key) do update set
    enabled = excluded.enabled,
    admins_only = excluded.admins_only,
    user_ids = excluded.user_ids,
    edition_ids = excluded.edition_ids,
    updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function private.studio2_feature_enabled_for(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.studio2_guard_jury_member_user_link() from public, anon, authenticated;

revoke all on function public.studio2_assign_jury_member(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.studio2_remove_jury_member(uuid) from public, anon;
revoke all on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[]) from public, anon;

grant execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.studio2_remove_jury_member(uuid) to authenticated, service_role;
grant execute on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
