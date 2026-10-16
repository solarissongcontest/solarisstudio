begin;

-- System V3 S7: bind jury votes to the exact edition-scoped objects they name.
-- Read-only production audits before this migration found 9,035 jury_votes and
-- zero violations of edition/show/country/entity/ballot scope. 1,801 historical
-- rows pair a vote entity with a voter whose contest_entity_id is NULL; those
-- rows are legitimate legacy country-scoped identity and remain supported.
-- When a voter has a canonical contest_entity_id, however, any supplied voter
-- entity must match it exactly.

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
  v_voter_entity_id uuid;
begin
  if p_edition_id is null then
    raise exception 'Jury vote edition is required' using errcode = '22023';
  end if;

  if p_show_id is not null then
    select show_row.edition_id
      into v_object_edition_id
    from public.shows show_row
    where show_row.id = p_show_id;
    if not found then
      raise exception 'Jury vote show not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury vote show belongs to another edition' using errcode = '42501';
    end if;
  end if;

  if p_voter_id is not null then
    select voter.edition_id, voter.show_id, voter.country_id, voter.contest_entity_id
      into v_object_edition_id, v_object_show_id, v_object_country_id, v_voter_entity_id
    from public.voters voter
    where voter.id = p_voter_id;
    if not found then
      raise exception 'Jury voter not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury voter belongs to another edition' using errcode = '42501';
    end if;
    -- A global voter (show_id NULL) may vote in a show. A show-scoped voter may
    -- never be used for another show or for an edition-level/null-show vote.
    if v_object_show_id is not null and v_object_show_id is distinct from p_show_id then
      raise exception 'Jury voter belongs to another show' using errcode = '42501';
    end if;
    if p_voter_country_id is not null and v_object_country_id is distinct from p_voter_country_id then
      raise exception 'Jury voter belongs to another country' using errcode = '42501';
    end if;
    if p_voter_entity_id is not null and v_voter_entity_id is not null
       and v_voter_entity_id is distinct from p_voter_entity_id then
      raise exception 'Jury voter entity does not match the voter identity' using errcode = '42501';
    end if;
  end if;

  if p_voter_entity_id is not null then
    select entity.edition_id, entity.country_id
      into v_object_edition_id, v_object_country_id
    from public.contest_entities entity
    where entity.id = p_voter_entity_id;
    if not found then
      raise exception 'Jury voter entity not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury voter entity belongs to another edition' using errcode = '42501';
    end if;
    -- IS DISTINCT FROM is intentional: custom entities are country-less and
    -- therefore cannot be paired with an arbitrary country identifier.
    if p_voter_country_id is not null and v_object_country_id is distinct from p_voter_country_id then
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
    from public.contest_entities entity
    where entity.id = p_receiving_entity_id;
    if not found then
      raise exception 'Jury recipient entity not found' using errcode = 'P0002';
    end if;
    if v_object_edition_id is distinct from p_edition_id then
      raise exception 'Jury recipient entity belongs to another edition' using errcode = '42501';
    end if;
    if p_receiving_country_id is not null and v_object_country_id is distinct from p_receiving_country_id then
      raise exception 'Jury recipient entity belongs to another country' using errcode = '42501';
    end if;
  end if;

  if p_ballot_submission_id is not null then
    select ballot.edition_id, ballot.show_id
      into v_object_edition_id, v_object_show_id
    from public.jury_ballot_submissions ballot
    where ballot.id = p_ballot_submission_id;
    if not found then
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

-- Fail the migration transaction before installing enforcement if the current
-- database already contains any row the new invariant would reject. This is
-- deliberately executed in the same transaction as the guard installation so
-- an audit failure cannot leave a partially hardened schema behind.
do $audit$
declare
  vote_row public.jury_votes%rowtype;
begin
  for vote_row in select * from public.jury_votes loop
    perform private.v3_assert_jury_vote_object_scope(
      vote_row.edition_id,
      vote_row.show_id,
      vote_row.voter_id,
      vote_row.voter_country_id,
      vote_row.voter_entity_id,
      vote_row.receiving_country_id,
      vote_row.receiving_entity_id,
      vote_row.ballot_submission_id
    );
  end loop;
end
$audit$;

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

-- Guard reverse drift as well. A valid vote must not become cross-edition or
-- cross-show merely because an organizer later edits one of its parent rows.
create or replace function private.v3_guard_jury_show_reference_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if new.edition_id is distinct from old.edition_id and exists (
    select 1 from public.jury_votes vote
    where vote.show_id = old.id
      and vote.edition_id is distinct from new.edition_id
  ) then
    raise exception 'Referenced jury vote prevents show edition drift' using errcode = '42501';
  end if;
  return new;
end
$trigger$;

create or replace function private.v3_guard_jury_voter_reference_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.voter_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (new.show_id is not null and vote.show_id is distinct from new.show_id)
        or (vote.voter_country_id is not null and new.country_id is distinct from vote.voter_country_id)
        or (
          new.contest_entity_id is not null
          and vote.voter_entity_id is not null
          and new.contest_entity_id is distinct from vote.voter_entity_id
        )
      )
  ) then
    raise exception 'Referenced jury vote prevents voter scope drift' using errcode = '42501';
  end if;
  return new;
end
$trigger$;

create or replace function private.v3_guard_jury_entity_reference_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.voter_entity_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (vote.voter_country_id is not null and new.country_id is distinct from vote.voter_country_id)
      )
  ) or exists (
    select 1
    from public.jury_votes vote
    where vote.receiving_entity_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or (vote.receiving_country_id is not null and new.country_id is distinct from vote.receiving_country_id)
      )
  ) then
    raise exception 'Referenced jury vote prevents contest entity scope drift' using errcode = '42501';
  end if;
  return new;
end
$trigger$;

create or replace function private.v3_guard_jury_ballot_reference_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if exists (
    select 1
    from public.jury_votes vote
    where vote.ballot_submission_id = old.id
      and (
        vote.edition_id is distinct from new.edition_id
        or vote.show_id is distinct from new.show_id
      )
  ) then
    raise exception 'Referenced jury vote prevents ballot submission scope drift' using errcode = '42501';
  end if;
  return new;
end
$trigger$;

revoke all on function private.v3_guard_jury_show_reference_scope() from public, anon, authenticated;
revoke all on function private.v3_guard_jury_voter_reference_scope() from public, anon, authenticated;
revoke all on function private.v3_guard_jury_entity_reference_scope() from public, anon, authenticated;
revoke all on function private.v3_guard_jury_ballot_reference_scope() from public, anon, authenticated;

drop trigger if exists v3_guard_jury_show_reference_scope on public.shows;
create trigger v3_guard_jury_show_reference_scope
before update of edition_id on public.shows
for each row execute function private.v3_guard_jury_show_reference_scope();

drop trigger if exists v3_guard_jury_voter_reference_scope on public.voters;
create trigger v3_guard_jury_voter_reference_scope
before update of edition_id, show_id, country_id, contest_entity_id on public.voters
for each row execute function private.v3_guard_jury_voter_reference_scope();

drop trigger if exists v3_guard_jury_entity_reference_scope on public.contest_entities;
create trigger v3_guard_jury_entity_reference_scope
before update of edition_id, country_id on public.contest_entities
for each row execute function private.v3_guard_jury_entity_reference_scope();

drop trigger if exists v3_guard_jury_ballot_reference_scope on public.jury_ballot_submissions;
create trigger v3_guard_jury_ballot_reference_scope
before update of edition_id, show_id on public.jury_ballot_submissions
for each row execute function private.v3_guard_jury_ballot_reference_scope();

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
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id,
    p_voter_entity_id, p_receiving_country_id, p_receiving_entity_id, null
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
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id,
    p_voter_entity_id, null, null, null
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
