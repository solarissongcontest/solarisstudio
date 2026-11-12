-- SOLARIS STUDIO V3 S13/S14 EMERGENCY DEFERRED-RPC ROLLOUT CANDIDATE
-- LOCAL REHEARSAL ONLY. NOT A TRACKED MIGRATION AND NOT AUTHORIZED ON HOSTED DB.
-- Source: exact existing public.submit_fantasy_team / public.submit_prediction
-- definitions with only fail-closed actor+canonical-edition rollout predicates.
-- No new canonical writers, tables, grants, flag storage or policy changes.
-- Future #1610 / v3_submit_fantasy_team must receive its own guard before adoption.
-- Requires isolated Supabase + full hosted-equivalent recovery and owner review.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $softlaunch_preflight$
begin
  if to_regprocedure('private.studio2_feature_enabled_for(uuid,text,uuid)') is null
     or to_regprocedure('public.submit_fantasy_team(uuid,uuid[],uuid)') is null
     or to_regprocedure('public.submit_prediction(uuid,jsonb)') is null
     or to_regclass('public.shows') is null
  then
    raise exception 'SOFT_LAUNCH_RPC_RECOVERY_BLOCKED: required existing authority absent'
      using errcode = '42501';
  end if;

  if to_regprocedure('public.v3_submit_fantasy_team(uuid,uuid[],uuid,bigint,uuid,text,uuid)') is not null then
    raise exception 'SOFT_LAUNCH_RPC_RECOVERY_BLOCKED: newer Fantasy writer needs separate rollout review'
      using errcode = '42501';
  end if;
end
$softlaunch_preflight$;

-- Existing Fantasy RPC and existing authenticated/service-role ACL preserved.
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

  -- BEGIN SOFT-LAUNCH FANTASY ROLLOUT GUARD
  -- Edition scope comes only from the locked canonical game row.
  -- An authenticated caller cannot bypass a hidden/tester-only rollout
  -- by invoking the older SECURITY DEFINER function directly.
  if v_game.edition_id is null
     or not coalesce(
       private.studio2_feature_enabled_for(v_user, 'fantasy_ssc', v_game.edition_id),
       false
     ) then
    raise exception 'Fantasy is not available for this account and edition'
      using errcode = '42501';
  end if;
  -- END SOFT-LAUNCH FANTASY ROLLOUT GUARD

  if v_game.status in ('cancelled', 'scoring', 'scored')
     or now() < v_game.opens_at
     or now() >= v_game.locks_at
  then
    raise exception 'Fantasy roster is locked';
  end if;

  if v_game.status = 'draft' then
    update public.fantasy_games
    set status = 'open', updated_at = now()
    where id = _game_id;
    v_game.status := 'open';
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

-- Existing Prediction RPC and its immutable snapshot/replay rules preserved.
create or replace function public.submit_prediction(
  _round_id uuid,
  _payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $submit$
declare
  current_user_id uuid := auth.uid();
  round_row public.prediction_rounds%rowtype;
  entry_row public.prediction_entries%rowtype;
  next_version integer;
  participant_count integer;
  qualifier_count integer;
  max_item_count integer;
  v_edition_id uuid;
  previous_payload jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(_payload) <> 'array' or jsonb_array_length(_payload) = 0 then
    raise exception 'Prediction payload must be a non-empty array';
  end if;

  select * into round_row
  from public.prediction_rounds
  where id = _round_id
  for update;

  if round_row.id is null then
    raise exception 'Prediction round not found';
  end if;

  -- BEGIN SOFT-LAUNCH PREDICTION ROLLOUT GUARD
  -- Never trust an edition parameter from the browser. Derive it from
  -- the canonical show owning this locked prediction round.
  select show_row.edition_id into v_edition_id
  from public.shows show_row
  where show_row.id = round_row.show_id;

  if v_edition_id is null
     or not coalesce(
       private.studio2_feature_enabled_for(
         current_user_id, 'prediction_league', v_edition_id
       ),
       false
     ) then
    raise exception 'Prediction League is not available for this account and edition'
      using errcode = '42501';
  end if;
  -- END SOFT-LAUNCH PREDICTION ROLLOUT GUARD

  if round_row.status <> 'open'
    or now() < round_row.opens_at
    or now() >= round_row.locks_at
  then
    raise exception 'Prediction round is not open';
  end if;

  if not public.show_publication_enabled(round_row.show_id, 'participants') then
    raise exception 'Prediction round is not published';
  end if;

  select count(*)::integer into participant_count
  from public.participants participant
  where participant.show_id = round_row.show_id;

  select show.qualifier_count into qualifier_count
  from public.shows show
  where show.id = round_row.show_id;

  -- This is not an invented traffic threshold. It is the exact largest payload
  -- shape that can be valid for this round's configured prediction types.
  max_item_count :=
      case when 'winner' = any(round_row.prediction_types) then 1 else 0 end
    + case when 'jury_winner' = any(round_row.prediction_types) then 1 else 0 end
    + case when 'televote_winner' = any(round_row.prediction_types) then 1 else 0 end
    + case when 'top_three' = any(round_row.prediction_types) then 3 else 0 end
    + case when 'top_ten' = any(round_row.prediction_types) then least(10, participant_count) else 0 end
    + case when 'full_ranking' = any(round_row.prediction_types) then participant_count else 0 end
    + case when 'qualifier' = any(round_row.prediction_types) then greatest(coalesce(qualifier_count, 0), 0) else 0 end;

  if jsonb_array_length(_payload) > max_item_count then
    raise exception 'Prediction payload exceeds the configured round item budget'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_payload) item
    where jsonb_typeof(item) <> 'object'
       or item - array['countryId','type','rank','confidence']::text[] <> '{}'::jsonb
       or not ((item ->> 'type') = any(round_row.prediction_types))
       or nullif(item ->> 'countryId', '') is null
  ) then
    raise exception 'Prediction contains an unavailable type, country or field'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from (
      select item ->> 'type' as prediction_type,
             item ->> 'countryId' as country_id,
             count(*) as duplicate_count
      from jsonb_array_elements(_payload) item
      group by item ->> 'type', item ->> 'countryId'
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Prediction contains a duplicate pick';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_payload) item
    where item ->> 'type' in ('winner', 'jury_winner', 'televote_winner', 'qualifier')
      and nullif(item ->> 'rank', '') is not null
  ) then
    raise exception 'Prediction contains an unexpected rank';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_payload) item
    where not exists (
      select 1 from public.participants participant
      where participant.show_id = round_row.show_id
        and (
          participant.country_id = (item ->> 'countryId')::uuid
          or participant.contest_entity_id = (item ->> 'countryId')::uuid
        )
    )
  ) then
    raise exception 'Prediction contains a country outside this show';
  end if;

  if 'winner' = any(round_row.prediction_types)
    and (select count(*) from jsonb_array_elements(_payload) item where item ->> 'type' = 'winner') <> 1
  then
    raise exception 'Prediction must contain exactly one winner';
  end if;

  if 'jury_winner' = any(round_row.prediction_types)
    and (select count(*) from jsonb_array_elements(_payload) item where item ->> 'type' = 'jury_winner') <> 1
  then
    raise exception 'Prediction must contain exactly one jury winner';
  end if;

  if 'televote_winner' = any(round_row.prediction_types)
    and (select count(*) from jsonb_array_elements(_payload) item where item ->> 'type' = 'televote_winner') <> 1
  then
    raise exception 'Prediction must contain exactly one televote winner';
  end if;

  if 'top_three' = any(round_row.prediction_types)
    and (
      select count(*) = 3
        and count(distinct nullif(item ->> 'rank', '')::integer) = 3
        and min(nullif(item ->> 'rank', '')::integer) = 1
        and max(nullif(item ->> 'rank', '')::integer) = 3
      from jsonb_array_elements(_payload) item
      where item ->> 'type' = 'top_three'
    ) is not true
  then
    raise exception 'Prediction must contain a ranked top three';
  end if;

  if 'top_ten' = any(round_row.prediction_types)
    and (
      select count(*) = least(10, participant_count)
        and count(distinct nullif(item ->> 'rank', '')::integer) = least(10, participant_count)
        and min(nullif(item ->> 'rank', '')::integer) = 1
        and max(nullif(item ->> 'rank', '')::integer) = least(10, participant_count)
      from jsonb_array_elements(_payload) item
      where item ->> 'type' = 'top_ten'
    ) is not true
  then
    raise exception 'Prediction must contain a complete ranked top ten';
  end if;

  if 'full_ranking' = any(round_row.prediction_types)
    and (
      select count(*) = participant_count
        and count(distinct nullif(item ->> 'rank', '')::integer) = participant_count
        and min(nullif(item ->> 'rank', '')::integer) = 1
        and max(nullif(item ->> 'rank', '')::integer) = participant_count
      from jsonb_array_elements(_payload) item
      where item ->> 'type' = 'full_ranking'
    ) is not true
  then
    raise exception 'Prediction must contain a complete ranking';
  end if;

  if 'qualifier' = any(round_row.prediction_types) then
    if qualifier_count is null or qualifier_count <= 0 then
      raise exception 'Qualifier prediction is not configured for this show';
    end if;

    if (
      select count(*) from jsonb_array_elements(_payload) item
      where item ->> 'type' = 'qualifier'
    ) <> qualifier_count then
      raise exception 'Prediction must contain the configured number of qualifiers';
    end if;
  end if;

  insert into public.fan_profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  select * into entry_row
  from public.prediction_entries
  where round_id = _round_id and profile_id = current_user_id
  for update;

  if entry_row.id is not null and entry_row.state in ('locked', 'scored') then
    raise exception 'Prediction is locked';
  end if;

  if entry_row.id is not null then
    select version_row.payload
    into previous_payload
    from public.prediction_entry_versions version_row
    where version_row.entry_id = entry_row.id
      and version_row.version = entry_row.version;

    if previous_payload is not null
       and private.v3_prediction_payload_canonical(previous_payload)
           = private.v3_prediction_payload_canonical(_payload) then
      return entry_row.id;
    end if;
  end if;

  if entry_row.id is null then
    insert into public.prediction_entries (
      round_id, profile_id, version, state, submitted_at, updated_at
    ) values (
      _round_id, current_user_id, 1, 'submitted', now(), now()
    ) returning * into entry_row;
    next_version := 1;
  else
    next_version := entry_row.version + 1;
    update public.prediction_entries
    set version = next_version,
        state = 'submitted',
        submitted_at = now(),
        updated_at = now()
    where id = entry_row.id
    returning * into entry_row;

    delete from public.prediction_items where entry_id = entry_row.id;
  end if;

  insert into public.prediction_items (
    entry_id, country_id, prediction_type, rank, confidence
  )
  select entry_row.id,
         (item ->> 'countryId')::uuid,
         item ->> 'type',
         nullif(item ->> 'rank', '')::integer,
         nullif(item ->> 'confidence', '')::numeric
  from jsonb_array_elements(_payload) item;

  insert into public.prediction_entry_versions (
    entry_id, version, payload, submitted_at
  ) values (
    entry_row.id, next_version, _payload, now()
  );

  return entry_row.id;
end
$submit$;

revoke all on function public.submit_prediction(uuid, jsonb) from public, anon;
grant execute on function public.submit_prediction(uuid, jsonb) to authenticated, service_role;

commit;
