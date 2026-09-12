begin;

-- Solaris has one jury per country. The jury is the country's Head of Delegation.
-- Keep the legacy numeric columns/RPC shape only as a compatibility surface, but
-- make the persisted invariant unambiguously equal to one.
update public.studio2_delegation_settings
set jury_members_required = 1,
    updated_at = now()
where jury_members_required <> 1;

alter table public.studio2_delegation_settings
  alter column jury_members_required set default 1;

alter table public.studio2_delegation_settings
  drop constraint if exists studio2_delegation_settings_jury_required_check,
  add constraint studio2_delegation_settings_jury_required_check
    check (jury_members_required = 1);

comment on column public.studio2_delegation_settings.jury_members_required is
  'Compatibility field. Solaris uses exactly one jury per country and that jury is the HOD; this value is always 1.';

create or replace function public.studio2_set_jury_requirement(
  p_edition_id uuid,
  p_country_id uuid,
  p_required smallint
)
returns public.studio2_delegation_settings
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_row public.studio2_delegation_settings%rowtype;
begin
  if p_required is distinct from 1 then
    raise exception 'Solaris has exactly one jury per country: the Head of Delegation'
      using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  insert into public.studio2_delegation_settings (
    edition_id,
    country_id,
    jury_members_required,
    updated_by
  )
  values (p_edition_id, p_country_id, 1, v_actor)
  on conflict (edition_id, country_id)
  do update set
    jury_members_required = 1,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  return v_row;
end
$$;

-- Preserve the Phase 6 context implementation for confirmation, entry, notices,
-- deadlines and review-history logic. The new public wrapper replaces only the
-- obsolete multi-member jury projection with the canonical HOD resolver model.
alter function public.studio2_hod_context(uuid, uuid)
  rename to studio2_hod_context_legacy_roster;

revoke all on function public.studio2_hod_context_legacy_roster(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context_legacy_roster(uuid, uuid)
  to service_role;

create or replace function public.studio2_hod_context(
  p_edition_id uuid,
  p_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_context jsonb;
  v_assignment_id uuid;
  v_person_id uuid;
  v_display_name text;
  v_member_user_id uuid;
  v_created_at timestamptz;
  v_channel text;
  v_jury_members jsonb := '[]'::jsonb;
  v_assigned integer := 0;
begin
  -- The legacy function still owns the authorization and all non-jury context.
  v_context := public.studio2_hod_context_legacy_roster(p_edition_id, p_country_id);

  -- A jury-channel HOD is an explicit historical override. Otherwise the normal
  -- delegation HOD is the jury. There can only be one assignment per channel.
  select
    a.id,
    a.person_id,
    p.display_name,
    ca.user_id,
    a.created_at,
    a.channel
  into
    v_assignment_id,
    v_person_id,
    v_display_name,
    v_member_user_id,
    v_created_at,
    v_channel
  from public.delegation_hod_assignments a
  join public.delegation_people p on p.id = a.person_id
  left join public.country_accounts ca
    on p.identity_key = 'account:' || ca.user_id::text
   and ca.country_id = p_country_id
   and ca.status = 'active'
  where a.edition_id = p_edition_id
    and a.country_id = p_country_id
    and a.channel in ('jury', 'delegation')
  order by
    case when a.channel = 'jury' then 0 else 1 end,
    a.updated_at desc,
    a.id
  limit 1;

  if found then
    v_assigned := 1;
    v_jury_members := jsonb_build_array(
      jsonb_build_object(
        'id', v_assignment_id,
        'displayName', v_display_name,
        'memberUserId', v_member_user_id,
        'createdAt', v_created_at
      )
    );
  end if;

  return v_context || jsonb_build_object(
    'juryMembersRequired', 1,
    'juryMembersAssigned', v_assigned,
    'juryMembers', v_jury_members,
    'juryHodPersonId', v_person_id,
    'juryHodChannel', v_channel
  );
end
$$;

revoke all on function public.studio2_hod_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context(uuid, uuid)
  to authenticated, service_role;

comment on function public.studio2_hod_context(uuid, uuid) is
  'Studio 2 HOD workspace context. Jury readiness resolves exactly one jury identity from canonical HOD history: jury-channel override first, otherwise delegation HOD.';

-- Official communications used the obsolete Studio 2 roster for the `jurors`
-- audience. Preserve all other audience behavior, but route juror notices through
-- the same canonical HOD identity used by jury voting and the HOD workspace.
alter function private.studio2_user_can_receive_notice_v2(uuid, uuid, text, uuid[], text)
  rename to studio2_user_can_receive_notice_v2_legacy_roster;

revoke all on function private.studio2_user_can_receive_notice_v2_legacy_roster(uuid, uuid, text, uuid[], text)
  from public, anon, authenticated;

create or replace function private.studio2_user_can_receive_notice_v2(
  p_user_id uuid,
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[],
  p_audience_group text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country_id uuid;
  v_selected_person_id uuid;
  v_account_person_id uuid;
begin
  if p_audience <> 'jurors' then
    return private.studio2_user_can_receive_notice_v2_legacy_roster(
      p_user_id,
      p_edition_id,
      p_audience,
      p_country_ids,
      p_audience_group
    );
  end if;

  if p_user_id is null then
    return false;
  end if;

  -- Preserve organizer inspection semantics from the communications system.
  if public.has_role(p_user_id, 'organizer'::public.app_role) then
    return true;
  end if;

  select ca.country_id
  into v_country_id
  from public.country_accounts ca
  where ca.user_id = p_user_id
    and ca.status = 'active'
  limit 1;

  if v_country_id is null then
    return false;
  end if;

  -- An unscoped jury communication targets current country HOD accounts. Edition-
  -- scoped messages additionally verify the canonical HOD identity for that edition.
  if p_edition_id is null then
    return true;
  end if;

  select a.person_id
  into v_selected_person_id
  from public.delegation_hod_assignments a
  where a.edition_id = p_edition_id
    and a.country_id = v_country_id
    and a.channel in ('jury', 'delegation')
  order by
    case when a.channel = 'jury' then 0 else 1 end,
    a.updated_at desc,
    a.id
  limit 1;

  if v_selected_person_id is null then
    return false;
  end if;

  select p.id
  into v_account_person_id
  from public.delegation_people p
  where p.identity_key = 'account:' || p_user_id::text
  limit 1;

  return v_account_person_id is not null
    and v_selected_person_id = v_account_person_id;
end
$$;

revoke all on function private.studio2_user_can_receive_notice_v2(uuid, uuid, text, uuid[], text)
  from public, anon, authenticated;

-- The standalone Studio 2 roster mutators are obsolete. Jury identity is managed
-- through canonical HOD history instead of a second jury-roster system.
revoke execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid)
  from authenticated;
revoke execute on function public.studio2_remove_jury_member(uuid)
  from authenticated;

comment on table public.studio2_jury_members is
  'Deprecated compatibility table from the abandoned multi-member Studio 2 jury roster. Solaris jury identity is canonical HOD history; new application writes must not use this table.';

notify pgrst, 'reload schema';

commit;
