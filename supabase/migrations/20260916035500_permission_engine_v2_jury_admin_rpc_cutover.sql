begin;

-- Permission Engine v2 cutover batch 8.
--
-- Raw jury-score editing was historically Organizer-only, so it remains strict
-- before authoritative cutover. Studio 2 jury-roster management already allowed
-- capability specialists and country owners, so those paths preserve that access
-- with non-strict capability checks. No scoring or roster business logic changes.

create or replace function public.assign_jury_vote(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter_key uuid := coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_recv_key uuid := coalesce(p_receiving_entity_id, p_receiving_country_id);
  v_id uuid;
begin
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  if v_voter_key is null or v_recv_key is null or p_points is null then
    raise exception 'A jury vote needs a voting entity, a recipient and a point value.' using errcode = '23514';
  end if;

  delete from public.jury_votes j
  where j.edition_id = p_edition_id
    and j.show_id is not distinct from p_show_id
    and coalesce(j.voter_id, j.voter_entity_id, j.voter_country_id) = v_voter_key
    and (
      j.points = p_points
      or coalesce(j.receiving_entity_id, j.receiving_country_id) = v_recv_key
    );

  insert into public.jury_votes (
    edition_id, show_id, voter_id, voter_country_id, voter_entity_id,
    receiving_country_id, receiving_entity_id, points
  ) values (
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id,
    p_receiving_country_id, p_receiving_entity_id, p_points
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.clear_jury_point(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_points integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter_key uuid := coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_count integer;
begin
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  delete from public.jury_votes j
  where j.edition_id = p_edition_id
    and j.show_id is not distinct from p_show_id
    and coalesce(j.voter_id, j.voter_entity_id, j.voter_country_id) = v_voter_key
    and j.points = p_points;

  get diagnostics v_count = row_count;
  return v_count;
end;
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
  v_required integer;
  v_assigned integer;
  v_member public.studio2_jury_members%rowtype;
begin
  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Jury member display name is required' using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, false)
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
end;
$$;

create or replace function public.studio2_remove_jury_member(p_member_id uuid)
returns public.studio2_jury_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_member public.studio2_jury_members%rowtype;
begin
  select * into v_member
  from public.studio2_jury_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Jury member not found: %', p_member_id using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', v_member.edition_id, false)
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
end;
$$;

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
  v_row public.studio2_delegation_settings%rowtype;
begin
  if p_required is distinct from 1 then
    raise exception 'Solaris has exactly one jury per country: the Head of Delegation'
      using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
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
end;
$$;

revoke all on function public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.studio2_assign_jury_member(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid) to authenticated, service_role;

revoke all on function public.studio2_remove_jury_member(uuid) from public, anon;
grant execute on function public.studio2_remove_jury_member(uuid) to authenticated, service_role;

revoke all on function public.studio2_set_jury_requirement(uuid, uuid, smallint) from public, anon;
grant execute on function public.studio2_set_jury_requirement(uuid, uuid, smallint) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
