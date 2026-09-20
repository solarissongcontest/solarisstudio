begin;

-- ============================================================
-- Solaris completion products: Prediction League, Fantasy SSC
-- and read-only Time Machine.
-- All new surfaces are rollout-gated. This migration deliberately
-- does not enable their feature flags.
-- ============================================================

-- Public product routes need a privacy-safe boolean rollout decision before
-- authentication. The existing function returns only a boolean and already
-- applies admins_only/user/edition restrictions against auth.uid(); granting
-- anon execution therefore exposes no rollout metadata or user identifiers.
grant execute on function public.studio2_feature_enabled(text, uuid) to anon;

-- Prediction League is the scored/public layer over the existing
-- Prediction Arena tables. It exposes only opted-in public identities.
create or replace function public.prediction_league_leaderboard(
  _edition_id uuid default null
)
returns table (
  "profileId" uuid,
  "displayName" text,
  score numeric,
  rounds bigint,
  "position" bigint,
  "lastScoredAt" timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      profile.id as profile_id,
      profile.display_name,
      sum(score.score)::numeric as total_score,
      count(*)::bigint as scored_rounds,
      max(score.scored_at) as last_scored_at
    from public.prediction_scores score
    join public.prediction_entries entry on entry.id = score.entry_id
    join public.prediction_rounds round on round.id = entry.round_id
    join public.shows show on show.id = round.show_id
    join public.fan_profiles profile on profile.id = entry.profile_id
    join public.editions edition on edition.id = show.edition_id
    where profile.visibility = 'public'
      and profile.leaderboard_opt_in = true
      and round.status = 'scored'
      and edition.published = true
      and (_edition_id is null or show.edition_id = _edition_id)
      and public.show_publication_enabled(round.show_id, 'results')
    group by profile.id, profile.display_name
  )
  select
    eligible.profile_id as "profileId",
    eligible.display_name as "displayName",
    eligible.total_score as score,
    eligible.scored_rounds as rounds,
    dense_rank() over (
      order by eligible.total_score desc, eligible.scored_rounds desc
    )::bigint as position,
    eligible.last_scored_at as "lastScoredAt"
  from eligible
  order by "position", eligible.display_name;
$$;

revoke all on function public.prediction_league_leaderboard(uuid) from public;
grant execute on function public.prediction_league_leaderboard(uuid) to anon, authenticated, service_role;

comment on function public.prediction_league_leaderboard(uuid) is
  'Privacy-safe Prediction League standings. Only public, opted-in fan profiles and scores backed by published result layers are returned.';

-- ============================================================
-- Country Voting DNA
-- ============================================================

-- Return compact, publication-safe aggregates instead of making every visitor
-- download the full historical jury ballot archive. SECURITY INVOKER keeps the
-- caller inside the existing public RLS boundary; explicit publication checks
-- are retained as a second line of defence.
create or replace function public.public_country_voting_dna(_country_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $
  with detailed_votes as (
    select
      vote.edition_id,
      vote.show_id,
      coalesce(vote.voter_country_id, voter_entity.country_id) as voter_country_id,
      coalesce(vote.receiving_country_id, receiving_entity.country_id) as receiving_country_id,
      vote.points
    from public.jury_votes vote
    join public.editions edition on edition.id = vote.edition_id
    left join public.contest_entities voter_entity
      on voter_entity.id = vote.voter_entity_id
     and voter_entity.edition_id = vote.edition_id
    left join public.contest_entities receiving_entity
      on receiving_entity.id = vote.receiving_entity_id
     and receiving_entity.edition_id = vote.edition_id
    where edition.published = true
      and vote.show_id is not null
      and public.show_publication_enabled(vote.show_id, 'detailed_voting')
  ),
  given as (
    select
      receiving_country_id as country_id,
      sum(points)::bigint as points,
      count(*)::bigint as ballots
    from detailed_votes
    where voter_country_id = _country_id
      and receiving_country_id is not null
      and receiving_country_id <> _country_id
    group by receiving_country_id
    order by points desc, ballots desc, receiving_country_id
    limit 10
  ),
  received as (
    select
      voter_country_id as country_id,
      sum(points)::bigint as points,
      count(*)::bigint as ballots
    from detailed_votes
    where receiving_country_id = _country_id
      and voter_country_id is not null
      and voter_country_id <> _country_id
    group by voter_country_id
    order by points desc, ballots desc, voter_country_id
    limit 10
  ),
  ranked_results as (
    select
      result.edition_id,
      result.show_id,
      result.final_rank,
      result.jury_points,
      result.televote_points,
      result.total_points,
      row_number() over (
        partition by result.edition_id
        order by
          case show.kind
            when 'grand-final' then 0
            when 'semi-final' then 1
            when 'second-chance' then 2
            when 'heat' then 3
            else 4
          end,
          show.sort_order desc nulls last,
          result.updated_at desc
      ) as rn
    from public.results result
    join public.shows show on show.id = result.show_id
    join public.editions edition on edition.id = result.edition_id
    left join public.contest_entities result_entity
      on result_entity.id = result.contest_entity_id
     and result_entity.edition_id = result.edition_id
    where edition.published = true
      and result.show_id is not null
      and (
        result.country_id = _country_id
        or result_entity.country_id = _country_id
      )
      and public.show_publication_enabled(result.show_id, 'results')
  ),
  selected_results as (
    select *
    from ranked_results
    where rn = 1
  ),
  sample as (
    select
      (
        select count(distinct edition_id)::bigint
        from detailed_votes
        where voter_country_id = _country_id or receiving_country_id = _country_id
      ) as detailed_editions,
      (
        select coalesce(sum(points), 0)::bigint
        from detailed_votes
        where voter_country_id = _country_id
      ) as given_points,
      (
        select coalesce(sum(points), 0)::bigint
        from detailed_votes
        where receiving_country_id = _country_id
      ) as received_points,
      (select count(*)::bigint from selected_results) as result_editions
  )
  select jsonb_build_object(
    'sample', jsonb_build_object(
      'detailedEditions', sample.detailed_editions,
      'givenPoints', sample.given_points,
      'receivedPoints', sample.received_points,
      'resultEditions', sample.result_editions
    ),
    'topGiven', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryId', given.country_id,
          'points', given.points,
          'ballots', given.ballots
        )
        order by given.points desc, given.ballots desc
      )
      from given
    ), '[]'::jsonb),
    'topReceived', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryId', received.country_id,
          'points', received.points,
          'ballots', received.ballots
        )
        order by received.points desc, received.ballots desc
      )
      from received
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'editionId', selected_results.edition_id,
          'showId', selected_results.show_id,
          'finalRank', selected_results.final_rank,
          'juryPoints', selected_results.jury_points,
          'televotePoints', selected_results.televote_points,
          'totalPoints', selected_results.total_points
        )
        order by edition.edition_number desc nulls last, edition.year desc nulls last
      )
      from selected_results
      join public.editions edition on edition.id = selected_results.edition_id
    ), '[]'::jsonb)
  )
  from sample;
$;

revoke all on function public.public_country_voting_dna(uuid) from public;
grant execute on function public.public_country_voting_dna(uuid) to anon, authenticated, service_role;

comment on function public.public_country_voting_dna(uuid) is
  'Compact publication-safe Country Voting DNA aggregates. Uses existing RLS and explicit publication gates to avoid shipping the raw ballot archive to clients.';

-- ============================================================
-- Fantasy SSC
-- ============================================================

create table if not exists public.fantasy_games (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'locked', 'scoring', 'scored', 'cancelled')),
  roster_size integer not null default 5 check (roster_size between 2 and 15),
  budget numeric(8,2) not null default 50 check (budget > 0),
  captain_multiplier numeric(5,2) not null default 2 check (captain_multiplier between 1 and 5),
  scoring_version text not null default 'v1',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at < locks_at),
  unique (edition_id, show_id)
);

create table if not exists public.fantasy_game_entries (
  game_id uuid not null references public.fantasy_games(id) on delete cascade,
  country_id uuid not null,
  cost numeric(8,2) not null check (cost > 0),
  eligible boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (game_id, country_id)
);

create table if not exists public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.fantasy_games(id) on delete restrict,
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  state text not null default 'submitted'
    check (state in ('submitted', 'locked', 'scored')),
  captain_country_id uuid,
  submitted_at timestamptz not null default now(),
  locked_at timestamptz,
  score numeric(10,2),
  scored_at timestamptz,
  scoring_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create table if not exists public.fantasy_team_entries (
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  country_id uuid not null,
  cost_locked numeric(8,2) not null check (cost_locked > 0),
  points numeric(10,2),
  breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(breakdown) = 'object'),
  primary key (team_id, country_id)
);

create index if not exists fantasy_games_status_lock_idx
  on public.fantasy_games (status, locks_at);
create index if not exists fantasy_teams_game_state_idx
  on public.fantasy_teams (game_id, state);
create index if not exists fantasy_teams_profile_idx
  on public.fantasy_teams (profile_id, game_id);

alter table public.fantasy_games enable row level security;
alter table public.fantasy_game_entries enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.fantasy_team_entries enable row level security;

grant select on public.fantasy_games, public.fantasy_game_entries to anon, authenticated;
grant select on public.fantasy_teams, public.fantasy_team_entries to authenticated;
grant all on public.fantasy_games, public.fantasy_game_entries, public.fantasy_teams, public.fantasy_team_entries to service_role;

drop policy if exists "public reads published fantasy games" on public.fantasy_games;
create policy "public reads published fantasy games"
on public.fantasy_games for select
to anon, authenticated
using (
  status in ('open', 'locked', 'scoring', 'scored')
  and exists (
    select 1
    from public.editions edition
    where edition.id = fantasy_games.edition_id
      and edition.published = true
  )
  and public.show_publication_enabled(show_id, 'participants')
);

drop policy if exists "public reads published fantasy choices" on public.fantasy_game_entries;
create policy "public reads published fantasy choices"
on public.fantasy_game_entries for select
to anon, authenticated
using (
  exists (
    select 1
    from public.fantasy_games game
    where game.id = fantasy_game_entries.game_id
      and game.status in ('open', 'locked', 'scoring', 'scored')
      and public.show_publication_enabled(game.show_id, 'participants')
      and exists (
        select 1 from public.editions edition
        where edition.id = game.edition_id and edition.published = true
      )
  )
);

drop policy if exists "organizers read fantasy games" on public.fantasy_games;
create policy "organizers read fantasy games"
on public.fantasy_games for select
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, false));

drop policy if exists "organizers read fantasy choices" on public.fantasy_game_entries;
create policy "organizers read fantasy choices"
on public.fantasy_game_entries for select
to authenticated
using (
  exists (
    select 1
    from public.fantasy_games game
    where game.id = fantasy_game_entries.game_id
      and public.studio2_access_allowed('edition.manage', game.edition_id, false)
  )
);

drop policy if exists "fans read own fantasy team" on public.fantasy_teams;
create policy "fans read own fantasy team"
on public.fantasy_teams for select
to authenticated
using ((select auth.uid()) = profile_id);

drop policy if exists "fans read own fantasy team entries" on public.fantasy_team_entries;
create policy "fans read own fantasy team entries"
on public.fantasy_team_entries for select
to authenticated
using (
  exists (
    select 1 from public.fantasy_teams team
    where team.id = fantasy_team_entries.team_id
      and team.profile_id = (select auth.uid())
  )
);

-- Organizer configuration uses the authoritative Permission Engine v2
-- through this bounded RPC instead of granting direct table writes.
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

  if not exists (
    select 1 from public.shows show
    where show.id = _show_id and show.edition_id = _edition_id
  ) then
    raise exception 'Fantasy show does not belong to the selected edition';
  end if;

  if _opens_at >= _locks_at then
    raise exception 'Fantasy window must open before it locks';
  end if;

  if _roster_size < 2 or _roster_size > 15 or _budget <= 0 or _captain_multiplier < 1 or _captain_multiplier > 5 then
    raise exception 'Fantasy configuration is outside allowed bounds';
  end if;

  if jsonb_typeof(_entries) <> 'array' or jsonb_array_length(_entries) < _roster_size then
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
        where participant.show_id = _show_id
          and (
            participant.country_id = (item ->> 'countryId')::uuid
            or participant.contest_entity_id = (item ->> 'countryId')::uuid
          )
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
    case when now() >= _locks_at then 'locked' when now() >= _opens_at then 'open' else 'draft' end,
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

  delete from public.fantasy_game_entries where game_id = v_game_id;

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

revoke all on function public.studio2_save_fantasy_game(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, numeric, numeric, jsonb) from public, anon;
grant execute on function public.studio2_save_fantasy_game(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, numeric, numeric, jsonb) to authenticated, service_role;

create or replace function public.submit_fantasy_team(
  _game_id uuid,
  _country_ids uuid[],
  _captain_country_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.fantasy_games%rowtype;
  v_team public.fantasy_teams%rowtype;
  v_cost numeric;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_game
  from public.fantasy_games
  where id = _game_id
  for update;

  if v_game.id is null then raise exception 'Fantasy game not found'; end if;

  if v_game.status <> 'open' or now() < v_game.opens_at or now() >= v_game.locks_at then
    raise exception 'Fantasy roster is locked';
  end if;

  if not public.show_publication_enabled(v_game.show_id, 'participants') then
    raise exception 'Fantasy game is not publicly available';
  end if;

  if cardinality(_country_ids) <> v_game.roster_size then
    raise exception 'Fantasy roster must contain exactly % entries', v_game.roster_size;
  end if;

  if (select count(distinct id) from unnest(_country_ids) id) <> v_game.roster_size then
    raise exception 'Fantasy roster contains duplicate entries';
  end if;

  if _captain_country_id is not null and not (_captain_country_id = any(_country_ids)) then
    raise exception 'Captain must be selected from the roster';
  end if;

  if exists (
    select 1
    from unnest(_country_ids) country_id
    where not exists (
      select 1 from public.fantasy_game_entries choice
      where choice.game_id = _game_id
        and choice.country_id = country_id
        and choice.eligible = true
    )
  ) then
    raise exception 'Fantasy roster contains an ineligible entry';
  end if;

  select sum(choice.cost)
  into v_cost
  from public.fantasy_game_entries choice
  where choice.game_id = _game_id
    and choice.country_id = any(_country_ids)
    and choice.eligible = true;

  if coalesce(v_cost, 0) > v_game.budget then
    raise exception 'Fantasy budget exceeded';
  end if;

  insert into public.fan_profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  select * into v_team
  from public.fantasy_teams
  where game_id = _game_id and profile_id = v_user
  for update;

  if v_team.id is not null and v_team.state in ('locked', 'scored') then
    raise exception 'Fantasy team is locked';
  end if;

  if v_team.id is null then
    insert into public.fantasy_teams (
      game_id, profile_id, state, captain_country_id,
      submitted_at, scoring_version, updated_at
    )
    values (
      _game_id, v_user, 'submitted', _captain_country_id,
      now(), v_game.scoring_version, now()
    )
    returning * into v_team;
  else
    update public.fantasy_teams
    set captain_country_id = _captain_country_id,
        submitted_at = now(),
        updated_at = now()
    where id = v_team.id
    returning * into v_team;

    delete from public.fantasy_team_entries where team_id = v_team.id;
  end if;

  insert into public.fantasy_team_entries (team_id, country_id, cost_locked)
  select v_team.id, choice.country_id, choice.cost
  from public.fantasy_game_entries choice
  where choice.game_id = _game_id
    and choice.country_id = any(_country_ids);

  return v_team.id;
end;
$$;

revoke all on function public.submit_fantasy_team(uuid, uuid[], uuid) from public, anon;
grant execute on function public.submit_fantasy_team(uuid, uuid[], uuid) to authenticated, service_role;

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
  select * into v_game from public.fantasy_games where id = _game_id for update;
  if v_game.id is null then raise exception 'Fantasy game not found'; end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception 'Missing Solaris results capability' using errcode = '42501';
  end if;

  if now() < v_game.locks_at then raise exception 'Fantasy game has not locked'; end if;
  if not public.show_publication_enabled(v_game.show_id, 'results') then
    raise exception 'Fantasy scoring waits for published results';
  end if;

  update public.fantasy_games set status = 'scoring', updated_at = now() where id = _game_id;

  for v_team in
    select * from public.fantasy_teams where game_id = _game_id
  loop
    v_total := 0;

    for v_entry in
      select team_entry.country_id,
             result.final_rank,
             result.jury_points,
             result.televote_points,
             participant.qualified
      from public.fantasy_team_entries team_entry
      left join public.results result
        on result.show_id = v_game.show_id
       and (result.country_id = team_entry.country_id or result.contest_entity_id = team_entry.country_id)
      left join public.participants participant
        on participant.show_id = v_game.show_id
       and (participant.country_id = team_entry.country_id or participant.contest_entity_id = team_entry.country_id)
      where team_entry.team_id = v_team.id
    loop
      v_subtotal :=
        greatest(0, 26 - coalesce(v_entry.final_rank, 30))
        + greatest(0, floor(coalesce(v_entry.jury_points, 0) / 20.0))
        + greatest(0, floor(coalesce(v_entry.televote_points, 0) / 20.0))
        + case when v_entry.qualified is true then 8 else 0 end;

      v_points := v_subtotal * case
        when v_team.captain_country_id = v_entry.country_id then v_game.captain_multiplier
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
      where team_id = v_team.id and country_id = v_entry.country_id;

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

  update public.fantasy_games set status = 'scored', updated_at = now() where id = _game_id;
  return v_count;
end;
$$;

revoke all on function public.score_fantasy_game(uuid) from public, anon;
grant execute on function public.score_fantasy_game(uuid) to authenticated, service_role;

create or replace function public.fantasy_leaderboard(_game_id uuid)
returns table (
  "profileId" uuid,
  "displayName" text,
  score numeric,
  "position" bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select
      team.profile_id,
      profile.display_name,
      team.score
    from public.fantasy_teams team
    join public.fantasy_games game on game.id = team.game_id
    join public.fan_profiles profile on profile.id = team.profile_id
    where team.game_id = _game_id
      and team.state = 'scored'
      and game.status = 'scored'
      and profile.visibility = 'public'
      and profile.leaderboard_opt_in = true
      and public.show_publication_enabled(game.show_id, 'results')
  )
  select
    rows.profile_id as "profileId",
    rows.display_name as "displayName",
    rows.score,
    dense_rank() over (order by rows.score desc)::bigint as position
  from rows
  order by "position", rows.display_name;
$$;

revoke all on function public.fantasy_leaderboard(uuid) from public;
grant execute on function public.fantasy_leaderboard(uuid) to anon, authenticated, service_role;

comment on table public.fantasy_games is
  'Rollout-gated Fantasy SSC game configuration. Server time, budget and result publication are authoritative.';
comment on function public.submit_fantasy_team(uuid, uuid[], uuid) is
  'Validates roster eligibility, uniqueness, budget and lock time before storing a Fantasy team.';
comment on function public.score_fantasy_game(uuid) is
  'Scores Fantasy SSC v1 only after the canonical result publication gate opens.';

-- ============================================================
-- Time Machine: read-only historical evidence projection
-- ============================================================

create or replace function public.studio2_time_machine(
  _edition_id uuid,
  _as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_edition public.editions%rowtype;
  v_events jsonb;
  v_audit jsonb;
  v_evidence_start timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if not public.studio2_access_allowed('edition.read', _edition_id, false)
     and not public.studio2_access_allowed('edition.manage', _edition_id, false)
  then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  select * into v_edition from public.editions where id = _edition_id;
  if v_edition.id is null then raise exception 'Edition not found'; end if;

  select min(event.occurred_at)
  into v_evidence_start
  from public.studio2_contest_events event
  where event.edition_id = _edition_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'occurredAt', source.occurred_at,
    'type', source.type,
    'entityType', source.entity_type,
    'entityId', source.entity_id
  ) order by source.occurred_at desc), '[]'::jsonb)
  into v_events
  from (
    select event.id, event.occurred_at, event.type, event.entity_type, event.entity_id
    from public.studio2_contest_events event
    where event.edition_id = _edition_id
      and event.occurred_at <= _as_of
    order by event.occurred_at desc
    limit 250
  ) source;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'createdAt', source.created_at,
    'action', source.action,
    'tableName', source.table_name,
    'recordId', source.record_id
  ) order by source.created_at desc), '[]'::jsonb)
  into v_audit
  from (
    select audit.id, audit.created_at, audit.action, audit.table_name, audit.record_id
    from public.admin_audit_log audit
    where audit.edition_id = _edition_id
      and audit.created_at <= _as_of
    order by audit.created_at desc
    limit 100
  ) source;

  return jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'editionNumber', v_edition.edition_number,
      'status', v_edition.status,
      'published', v_edition.published
    ),
    'asOf', _as_of,
    'events', v_events,
    'audit', v_audit,
    'evidenceStart', v_evidence_start,
    'evidenceComplete', v_evidence_start is not null and _as_of >= v_evidence_start
  );
end;
$$;

revoke all on function public.studio2_time_machine(uuid, timestamptz) from public, anon;
grant execute on function public.studio2_time_machine(uuid, timestamptz) to authenticated, service_role;

comment on function public.studio2_time_machine(uuid, timestamptz) is
  'Read-only Time Machine projection. Returns recorded event/audit markers only and intentionally does not fabricate missing historical state.';

commit;
