begin;

-- System V3 S8: Prediction Arena already owns one row per round/profile and
-- validates round state, participants and prediction shape. Harden the existing
-- authority against retry amplification by deriving a maximum valid item count
-- from the round configuration and treating semantically identical payloads as
-- no-op retries instead of creating new versions/items.

create or replace function private.v3_prediction_payload_canonical(p_payload jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $canonical$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'countryId', item ->> 'countryId',
        'type', item ->> 'type',
        'rank', item -> 'rank',
        'confidence', item -> 'confidence'
      )
      order by
        item ->> 'type',
        coalesce(nullif(item ->> 'rank', '')::integer, 2147483647),
        item ->> 'countryId',
        coalesce(item ->> 'confidence', '')
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p_payload) item;
$canonical$;

revoke all on function private.v3_prediction_payload_canonical(jsonb)
  from public, anon, authenticated;

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
