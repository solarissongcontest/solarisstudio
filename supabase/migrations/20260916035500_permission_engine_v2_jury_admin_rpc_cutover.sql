begin;

-- Permission Engine v2 cutover batch 8.
--
-- Cut only the live jury administration RPCs over to Permission Engine v2.
-- The deprecated Studio 2 multi-member jury roster RPCs intentionally remain
-- closed to authenticated users and are handled later as private compatibility
-- debt. Do not resurrect them during an authorization migration.

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

revoke all on function public.studio2_set_jury_requirement(uuid, uuid, smallint) from public, anon;
grant execute on function public.studio2_set_jury_requirement(uuid, uuid, smallint) to authenticated, service_role;

-- Explicitly preserve the deprecation boundary from the one-HOD-jury migration.
revoke execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid) from authenticated;
revoke execute on function public.studio2_remove_jury_member(uuid) from authenticated;

notify pgrst, 'reload schema';

commit;
