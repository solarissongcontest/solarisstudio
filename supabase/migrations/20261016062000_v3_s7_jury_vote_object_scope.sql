begin;

-- System V3 S7: defend legacy jury-vote writes against cross-edition object IDs.
-- Production audit before this migration found 0 show/entity/ballot/voter scope
-- mismatches across 9,035 existing jury_votes rows. Recipient countries also
-- all resolve to the same edition. Forty historical voter-country rows do not
-- have an edition participant/entity identity, so voter-country membership is
-- deliberately not tightened beyond consistency with supplied voter objects.

create or replace function private.v3_assert_jury_vote_object_scope(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_ballot_submission_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_object_edition_id uuid;
  v_object_show_id uuid;
  v_object_country_id uuid;
begin
  if p_edition_id is null then
    raise exception 'Jury vote edition is required' using errcode = '22023';
  end if;

  if p_show_id is not null then
    select show_row.edition_id into v_object_edition_id
    from public.shows show_row where show_row.id = p_show_id;
    if v_object_edition_id is null then
      raise exception 'Jury vote show not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury vote show belongs to another edition' using errcode = '42501';
    end if;
  end if;

  if p_voter_id is not null then
    select voter.edition_id, voter.show_id, voter.country_id
      into v_object_edition_id, v_object_show_id, v_object_country_id
    from public.voters voter where voter.id = p_voter_id;
    if v_object_edition_id is null then
      raise exception 'Jury voter not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury voter belongs to another edition' using errcode = '42501';
    end if;
    if p_show_id is not null and v_object_show_id is not null
       and v_object_show_id is distinct from p_show_id then
      raise exception 'Jury voter belongs to another show' using errcode = '42501';
    end if;
    if p_voter_country_id is not null and v_object_country_id is not null
       and v_object_country_id is distinct from p_voter_country_id then
      raise exception 'Jury voter belongs to another country' using errcode = '42501';
    end if;
  end if;

  if p_voter_entity_id is not null then
    select entity.edition_id, entity.country_id
      into v_object_edition_id, v_object_country_id
    from public.contest_entities entity where entity.id = p_voter_entity_id;
    if v_object_edition_id is null then
      raise exception 'Jury voter entity not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury voter entity belongs to another edition' using errcode = '42501';
    end if;
    if p_voter_country_id is not null and v_object_country_id is not null
       and v_object_country_id is distinct from p_voter_country_id then
      raise exception 'Jury voter entity belongs to another country' using errcode = '42501';
    end if;
  end if;

  if p_receiving_country_id is not null and not exists (
    select 1
    from public.contest_entities entity
    where entity.edition_id = p_edition_id
      and entity.country_id = p_receiving_country_id
    union all
    select 1
    from public.participants participant
    where participant.edition_id = p_edition_id
      and participant.country_id = p_receiving_country_id
  ) then
    raise exception 'Jury recipient country does not belong to this edition'
      using errcode = '42501';
  end if;

  if p_receiving_entity_id is not null then
    select entity.edition_id, entity.country_id
      into v_object_edition_id, v_object_country_id
    from public.contest_entities entity where entity.id = p_receiving_entity_id;
    if v_object_edition_id is null then
      raise exception 'Jury recipient entity not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury recipient entity belongs to another edition' using errcode = '42501';
    end if;
    if p_receiving_country_id is not null and v_object_country_id is not null
       and v_object_country_id is distinct from p_receiving_country_id then
      raise exception 'Jury recipient entity belongs to another country' using errcode = '42501';
    end if;
  end if;

  if p_ballot_submission_id is not null then
    select ballot.edition_id, ballot.show_id
      into v_object_edition_id, v_object_show_id
    from public.jury_ballot_submissions ballot
    where ballot.id = p_ballot_submission_id;
    if v_object_edition_id is null then
      raise exception 'Jury ballot submission not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id
       or v_object_show_id is distinct from p_show_id then
      raise exception 'Jury ballot submission belongs to another edition or show'
        using errcode = '42501';
    end if;
  end if;
end
$guard$;

revoke all on function private.v3_assert_jury_vote_object_scope(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.v3_assert_jury_vote_object_scope(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  to service_role;

create or replace function private.v3_guard_jury_vote_object_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  perform private.v3_assert_jury_vote_object_scope(
    new.edition_id,
    new.show_id,
    new.voter_id,
    new.voter_country_id,
    new.voter_entity_id,
    new.receiving_country_id,
    new.receiving_entity_id,
    new.ballot_submission_id
  );
  return new;
end
$trigger$;

revoke all on function private.v3_guard_jury_vote_object_scope()
  from public, anon, authenticated;

drop trigger if exists v3_guard_jury_vote_object_scope on public.jury_votes;
create trigger v3_guard_jury_vote_object_scope
before insert or update of edition_id, show_id, voter_id, voter_country_id, voter_entity_id,
  receiving_country_id, receiving_entity_id, ballot_submission_id
on public.jury_votes
for each row execute function private.v3_guard_jury_vote_object_scope();

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
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_voter_key uuid := coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_recv_key uuid := coalesce(p_receiving_entity_id, p_receiving_country_id);
  v_id uuid;
begin
  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    p_receiving_country_id,
    p_receiving_entity_id,
    null
  );

  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  if v_voter_key is null or v_recv_key is null or p_points is null then
    raise exception 'A jury vote needs a voting entity, a recipient and a point value.' using errcode = '23514';
  end if;

  delete from public.jury_votes vote
  where vote.edition_id = p_edition_id
    and vote.show_id is not distinct from p_show_id
    and coalesce(vote.voter_id, vote.voter_entity_id, vote.voter_country_id) = v_voter_key
    and (
      vote.points = p_points
      or coalesce(vote.receiving_entity_id, vote.receiving_country_id) = v_recv_key
    );

  insert into public.jury_votes (
    edition_id, show_id, voter_id, voter_country_id, voter_entity_id,
    receiving_country_id, receiving_entity_id, points
  ) values (
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id,
    p_receiving_country_id, p_receiving_entity_id, p_points
  ) returning id into v_id;

  return v_id;
end
$rpc$;

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
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_voter_key uuid := coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_count integer;
begin
  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    null,
    null,
    null
  );

  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  delete from public.jury_votes vote
  where vote.edition_id = p_edition_id
    and vote.show_id is not distinct from p_show_id
    and coalesce(vote.voter_id, vote.voter_entity_id, vote.voter_country_id) = v_voter_key
    and vote.points = p_points;

  get diagnostics v_count = row_count;
  return v_count;
end
$rpc$;

revoke all on function public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)
  from public, anon;
grant execute on function public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)
  to authenticated, service_role;

revoke all on function public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)
  from public, anon;
grant execute on function public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
