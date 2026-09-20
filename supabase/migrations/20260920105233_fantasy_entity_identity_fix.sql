begin;

create or replace function public.studio2_save_fantasy_game(
  _game_id uuid,
  _edition_id uuid,
  _show_id uuid,
  _name text,
  _opens_at timestamptz,
  _locks_at timestamptz,
  _roster_size integer,
  _budget numeric,
  _captain_multiplier numeric,
  _entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_game_id uuid := coalesce(_game_id, gen_random_uuid());
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.studio2_access_allowed('edition.manage', _edition_id, false) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  if _game_id is not null and exists (
    select 1
    from public.fantasy_games game
    where game.id = _game_id
      and game.edition_id <> _edition_id
  ) then
    raise exception 'Fantasy game belongs to a different edition';
  end if;

  if _game_id is not null and exists (
    select 1
    from public.fantasy_games game
    where game.id = _game_id
      and (
        game.status in ('locked', 'scoring', 'scored', 'cancelled')
        or now() >= game.locks_at
      )
  ) then
    raise exception 'Fantasy rules are immutable after the roster lock';
  end if;

  if not exists (
    select 1
    from public.shows show
    where show.id = _show_id
      and show.edition_id = _edition_id
  ) then
    raise exception 'Fantasy show does not belong to the selected edition';
  end if;

  if _opens_at >= _locks_at then
    raise exception 'Fantasy window must open before it locks';
  end if;

  if _roster_size < 2 or _roster_size > 15
     or _budget <= 0
     or _captain_multiplier < 1
     or _captain_multiplier > 5
  then
    raise exception 'Fantasy configuration is outside allowed bounds';
  end if;

  if jsonb_typeof(_entries) <> 'array'
     or jsonb_array_length(_entries) < _roster_size
  then
    raise exception 'Fantasy choices must contain at least the roster size';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_entries) item
    where nullif(item ->> 'countryId', '') is null
      or nullif(item ->> 'cost', '') is null
      or (item ->> 'cost')::numeric <= 0
      or not exists (
        select 1
        from public.participants participant
        left join public.contest_entities entity
          on entity.id = participant.contest_entity_id
         and entity.edition_id = participant.edition_id
        where participant.show_id = _show_id
          and coalesce(participant.country_id, entity.country_id)
              = (item ->> 'countryId')::uuid
      )
  ) then
    raise exception 'Fantasy choices contain an ineligible participant or invalid cost';
  end if;

  if exists (
    select 1
    from (
      select item ->> 'countryId' as country_id, count(*)
      from jsonb_array_elements(_entries) item
      group by item ->> 'countryId'
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'Fantasy choices contain duplicate countries';
  end if;

  insert into public.fantasy_games (
    id, edition_id, show_id, name, opens_at, locks_at,
    status, roster_size, budget, captain_multiplier,
    scoring_version, created_by, updated_at
  )
  values (
    v_game_id, _edition_id, _show_id, trim(_name), _opens_at, _locks_at,
    case
      when now() >= _locks_at then 'locked'
      when now() >= _opens_at then 'open'
      else 'draft'
    end,
    _roster_size, _budget, _captain_multiplier,
    'v1', v_actor, now()
  )
  on conflict (id) do update
  set
    show_id = excluded.show_id,
    name = excluded.name,
    opens_at = excluded.opens_at,
    locks_at = excluded.locks_at,
    roster_size = excluded.roster_size,
    budget = excluded.budget,
    captain_multiplier = excluded.captain_multiplier,
    status = case
      when fantasy_games.status in ('scoring', 'scored') then fantasy_games.status
      when now() >= excluded.locks_at then 'locked'
      when now() >= excluded.opens_at then 'open'
      else 'draft'
    end,
    updated_at = now();

  delete from public.fantasy_game_entries
  where game_id = v_game_id;

  insert into public.fantasy_game_entries (game_id, country_id, cost, eligible)
  select
    v_game_id,
    (item ->> 'countryId')::uuid,
    (item ->> 'cost')::numeric,
    coalesce((item ->> 'eligible')::boolean, true)
  from jsonb_array_elements(_entries) item;

  return v_game_id;
end;
$$;

revoke all on function public.studio2_save_fantasy_game(
  uuid, uuid, uuid, text, timestamptz, timestamptz, integer, numeric, numeric, jsonb
) from public, anon;
grant execute on function public.studio2_save_fantasy_game(
  uuid, uuid, uuid, text, timestamptz, timestamptz, integer, numeric, numeric, jsonb
) to authenticated, service_role;

create or replace function public.score_fantasy_game(_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.fantasy_games%rowtype;
  v_team record;
  v_entry record;
  v_subtotal numeric;
  v_points numeric;
  v_total numeric;
  v_count integer := 0;
begin
  select *
  into v_game
  from public.fantasy_games
  where id = _game_id
  for update;

  if v_game.id is null then
    raise exception 'Fantasy game not found';
  end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception 'Missing Solaris results capability' using errcode = '42501';
  end if;

  if now() < v_game.locks_at then
    raise exception 'Fantasy game has not locked';
  end if;

  if not public.show_publication_enabled(v_game.show_id, 'results') then
    raise exception 'Fantasy scoring waits for published results';
  end if;

  update public.fantasy_games
  set status = 'scoring',
      updated_at = now()
  where id = _game_id;

  for v_team in
    select *
    from public.fantasy_teams
    where game_id = _game_id
  loop
    v_total := 0;

    for v_entry in
      select
        team_entry.country_id,
        result_row.final_rank,
        result_row.jury_points,
        result_row.televote_points,
        participant_row.qualified
      from public.fantasy_team_entries team_entry
      left join lateral (
        select
          result.final_rank,
          result.jury_points,
          result.televote_points
        from public.results result
        left join public.contest_entities entity
          on entity.id = result.contest_entity_id
         and entity.edition_id = result.edition_id
        where result.show_id = v_game.show_id
          and coalesce(result.country_id, entity.country_id) = team_entry.country_id
        order by result.updated_at desc, result.id
        limit 1
      ) result_row on true
      left join lateral (
        select participant.qualified
        from public.participants participant
        left join public.contest_entities entity
          on entity.id = participant.contest_entity_id
         and entity.edition_id = participant.edition_id
        where participant.show_id = v_game.show_id
          and coalesce(participant.country_id, entity.country_id) = team_entry.country_id
        order by participant.updated_at desc, participant.id
        limit 1
      ) participant_row on true
      where team_entry.team_id = v_team.id
    loop
      v_subtotal :=
        greatest(0, 26 - coalesce(v_entry.final_rank, 30))
        + greatest(0, floor(coalesce(v_entry.jury_points, 0) / 20.0))
        + greatest(0, floor(coalesce(v_entry.televote_points, 0) / 20.0))
        + case when v_entry.qualified is true then 8 else 0 end;

      v_points := v_subtotal * case
        when v_team.captain_country_id = v_entry.country_id
          then v_game.captain_multiplier
        else 1
      end;

      update public.fantasy_team_entries
      set points = v_points,
          breakdown = jsonb_build_object(
            'placement', greatest(0, 26 - coalesce(v_entry.final_rank, 30)),
            'jury', greatest(0, floor(coalesce(v_entry.jury_points, 0) / 20.0)),
            'televote', greatest(0, floor(coalesce(v_entry.televote_points, 0) / 20.0)),
            'qualification', case when v_entry.qualified is true then 8 else 0 end,
            'captain', v_team.captain_country_id = v_entry.country_id,
            'version', 'v1'
          )
      where team_id = v_team.id
        and country_id = v_entry.country_id;

      v_total := v_total + v_points;
    end loop;

    update public.fantasy_teams
    set state = 'scored',
        locked_at = coalesce(locked_at, v_game.locks_at),
        score = v_total,
        scored_at = now(),
        scoring_version = v_game.scoring_version,
        updated_at = now()
    where id = v_team.id;

    v_count := v_count + 1;
  end loop;

  update public.fantasy_games
  set status = 'scored',
      updated_at = now()
  where id = _game_id;

  return v_count;
end;
$$;

revoke all on function public.score_fantasy_game(uuid) from public, anon;
grant execute on function public.score_fantasy_game(uuid)
  to authenticated, service_role;

commit;
