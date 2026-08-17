-- Restore the Prediction Arena policies and RPCs lost when production migration history was rebuilt.
-- Logic is carried forward from 20260812005000_phase_2_prediction_arena_foundation.sql.

alter table public.fan_profiles enable row level security;
alter table public.prediction_rounds enable row level security;
alter table public.prediction_entries enable row level security;
alter table public.prediction_items enable row level security;
alter table public.prediction_entry_versions enable row level security;
alter table public.prediction_scores enable row level security;

grant select, insert, update, delete on public.fan_profiles to authenticated;
grant select on public.prediction_rounds to anon, authenticated;
grant insert, update, delete on public.prediction_rounds to authenticated;
grant select on public.prediction_entries to authenticated;
grant select on public.prediction_items to authenticated;
grant select on public.prediction_entry_versions to authenticated;
grant select on public.prediction_scores to authenticated;

grant all on public.fan_profiles to service_role;
grant all on public.prediction_rounds to service_role;
grant all on public.prediction_entries to service_role;
grant all on public.prediction_items to service_role;
grant all on public.prediction_entry_versions to service_role;
grant all on public.prediction_scores to service_role;

drop policy if exists "fans read own profile" on public.fan_profiles;
create policy "fans read own profile"
on public.fan_profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "fans create own profile" on public.fan_profiles;
create policy "fans create own profile"
on public.fan_profiles for insert to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "fans update own profile" on public.fan_profiles;
create policy "fans update own profile"
on public.fan_profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "fans delete own profile" on public.fan_profiles;
create policy "fans delete own profile"
on public.fan_profiles for delete to authenticated
using ((select auth.uid()) = id);

drop policy if exists "public reads published prediction rounds" on public.prediction_rounds;
create policy "public reads published prediction rounds"
on public.prediction_rounds for select to anon, authenticated
using (
  (
    status in ('open', 'locked', 'scoring', 'scored')
    and public.show_publication_enabled(show_id, 'participants')
  )
  or public.has_role((select auth.uid()), 'organizer'::public.app_role)
);

drop policy if exists "organizers manage prediction rounds" on public.prediction_rounds;
create policy "organizers manage prediction rounds"
on public.prediction_rounds for all to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role))
with check (public.has_role((select auth.uid()), 'organizer'::public.app_role));

drop policy if exists "fans read own prediction entries" on public.prediction_entries;
create policy "fans read own prediction entries"
on public.prediction_entries for select to authenticated
using ((select auth.uid()) = profile_id);

drop policy if exists "fans read own prediction items" on public.prediction_items;
create policy "fans read own prediction items"
on public.prediction_items for select to authenticated
using (
  exists (
    select 1 from public.prediction_entries entry
    where entry.id = prediction_items.entry_id
      and entry.profile_id = (select auth.uid())
  )
);

drop policy if exists "fans read own prediction versions" on public.prediction_entry_versions;
create policy "fans read own prediction versions"
on public.prediction_entry_versions for select to authenticated
using (
  exists (
    select 1 from public.prediction_entries entry
    where entry.id = prediction_entry_versions.entry_id
      and entry.profile_id = (select auth.uid())
  )
);

drop policy if exists "fans read own prediction scores" on public.prediction_scores;
create policy "fans read own prediction scores"
on public.prediction_scores for select to authenticated
using (
  exists (
    select 1 from public.prediction_entries entry
    where entry.id = prediction_scores.entry_id
      and entry.profile_id = (select auth.uid())
  )
);

create or replace function public.submit_prediction(
  _round_id uuid,
  _payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  round_row public.prediction_rounds%rowtype;
  entry_row public.prediction_entries%rowtype;
  next_version integer;
  participant_count integer;
  qualifier_count integer;
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

  if round_row.status <> 'open'
    or now() < round_row.opens_at
    or now() >= round_row.locks_at
  then
    raise exception 'Prediction round is not open';
  end if;

  if not public.show_publication_enabled(round_row.show_id, 'participants') then
    raise exception 'Prediction round is not published';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_payload) item
    where not ((item ->> 'type') = any(round_row.prediction_types))
      or nullif(item ->> 'countryId', '') is null
  ) then
    raise exception 'Prediction contains an unavailable type or country';
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

  select count(*)::integer into participant_count
  from public.participants participant
  where participant.show_id = round_row.show_id;

  select show.qualifier_count into qualifier_count
  from public.shows show
  where show.id = round_row.show_id;

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
end;
$$;

revoke all on function public.submit_prediction(uuid, jsonb) from public, anon;
grant execute on function public.submit_prediction(uuid, jsonb) to authenticated, service_role;

create or replace function public.prediction_consensus(
  _round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  round_row public.prediction_rounds%rowtype;
  sample_size integer;
  aggregate_payload jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select * into round_row from public.prediction_rounds where id = _round_id;
  if round_row.id is null then raise exception 'Prediction round not found'; end if;

  if not public.show_publication_enabled(round_row.show_id, 'participants')
    and not public.has_role(current_user_id, 'organizer'::public.app_role)
  then
    raise exception 'Prediction round is not published';
  end if;

  if round_row.status in ('draft', 'cancelled')
    and not public.has_role(current_user_id, 'organizer'::public.app_role)
  then
    raise exception 'Prediction round is unavailable';
  end if;

  if now() < round_row.locks_at
    and not exists (
      select 1 from public.prediction_entries entry
      where entry.round_id = _round_id
        and entry.profile_id = current_user_id
        and entry.state in ('submitted', 'locked', 'scored')
    )
  then
    raise exception 'Submit a prediction before viewing consensus';
  end if;

  select count(*)::integer into sample_size
  from public.prediction_entries entry
  where entry.round_id = _round_id
    and entry.state in ('submitted', 'locked', 'scored');

  if sample_size < round_row.consensus_minimum then
    return jsonb_build_object(
      'ready', false,
      'sampleSize', sample_size,
      'minimum', round_row.consensus_minimum,
      'items', '{}'::jsonb
    );
  end if;

  select coalesce(
    jsonb_object_agg(
      grouped.prediction_type || ':' || grouped.country_id::text,
      jsonb_build_object(
        'count', grouped.pick_count,
        'percentage', round((grouped.pick_count::numeric / sample_size) * 100, 1)
      )
    ),
    '{}'::jsonb
  ) into aggregate_payload
  from (
    select item.prediction_type, item.country_id, count(*)::integer as pick_count
    from public.prediction_items item
    join public.prediction_entries entry on entry.id = item.entry_id
    where entry.round_id = _round_id
      and entry.state in ('submitted', 'locked', 'scored')
    group by item.prediction_type, item.country_id
  ) grouped;

  return jsonb_build_object(
    'ready', true,
    'sampleSize', sample_size,
    'minimum', round_row.consensus_minimum,
    'items', aggregate_payload
  );
end;
$$;

revoke all on function public.prediction_consensus(uuid) from public, anon;
grant execute on function public.prediction_consensus(uuid) to authenticated, service_role;
