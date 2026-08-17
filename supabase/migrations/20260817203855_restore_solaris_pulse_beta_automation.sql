-- Restore Solaris Pulse automation and privacy-safe prediction movement lost when production migration history was rebuilt.
-- Logic is carried forward from 20260811160000_phase_3_solaris_pulse.sql.

alter table public.content_events add column if not exists dedupe_key text;
create unique index if not exists content_events_dedupe_key_idx on public.content_events (dedupe_key);

alter table public.content_events drop constraint if exists content_events_event_type_check;
alter table public.content_events add constraint content_events_event_type_check
check (event_type in (
  'entry_published',
  'running_order_published',
  'prediction_opened',
  'prediction_locked',
  'prediction_movement',
  'results_published',
  'record_broken',
  'record_threat',
  'story_published',
  'edition_update'
));

create or replace function public.mark_content_events_read(_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  affected integer := 0;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  insert into public.fan_profiles (id) values (current_user_id) on conflict (id) do nothing;

  insert into public.fan_event_reads (profile_id, event_id, read_at)
  select current_user_id, event.id, now()
  from public.content_events event
  where event.id = any(coalesce(_event_ids, array[]::uuid[]))
    and event.published_at <= now()
  on conflict (profile_id, event_id) do update set read_at = excluded.read_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.mark_content_events_read(uuid[]) from public, anon;
grant execute on function public.mark_content_events_read(uuid[]) to authenticated, service_role;

create or replace function public.emit_edition_pulse_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published is true and (tg_op = 'INSERT' or old.published is distinct from true) then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'edition_update', 'edition', new.id,
      coalesce(nullif(new.name, ''), 'A Solaris edition') || ' is now public',
      'The edition hub is live with the public information currently released.',
      '/editions/' || new.slug,
      'important',
      jsonb_build_object('editionId', new.id, 'editionNumber', new.edition_number),
      now(),
      'edition:' || new.id::text || ':published'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title,
      summary = excluded.summary,
      route = excluded.route,
      payload = excluded.payload,
      published_at = least(public.content_events.published_at, excluded.published_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_emit_edition_pulse_event on public.editions;
create trigger trg_emit_edition_pulse_event
after insert or update on public.editions
for each row execute function public.emit_edition_pulse_event();

create or replace function public.emit_show_pulse_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_config jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.publication_config, '{}'::jsonb) end;
  new_config jsonb := coalesce(new.publication_config, '{}'::jsonb);
  country_ids jsonb := '[]'::jsonb;
  contest_entity_ids jsonb := '[]'::jsonb;
  edition_slug text;
  show_is_public boolean := new.published is true;
  old_show_was_public boolean := case when tg_op = 'INSERT' then false else old.published is true end;
begin
  if not show_is_public then return new; end if;

  select
    coalesce(jsonb_agg(distinct participant.country_id) filter (where participant.country_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(distinct participant.contest_entity_id) filter (where participant.contest_entity_id is not null), '[]'::jsonb)
  into country_ids, contest_entity_ids
  from public.participants participant
  where participant.show_id = new.id;

  select edition.slug into edition_slug
  from public.editions edition
  where edition.id = new.edition_id;

  if (
    coalesce((new_config ->> 'songs')::boolean, false)
    or coalesce((new_config ->> 'artists')::boolean, false)
  ) and (
    not old_show_was_public
    or not (
      coalesce((old_config ->> 'songs')::boolean, false)
      or coalesce((old_config ->> 'artists')::boolean, false)
    )
  ) then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'entry_published', 'show', new.id,
      'Entries are out for ' || new.name,
      'Artists and songs have been released for this show.',
      '/shows/' || new.id::text,
      'important',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':entries'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  if coalesce((new_config ->> 'running_order')::boolean, false)
    and (not old_show_was_public or not coalesce((old_config ->> 'running_order')::boolean, false))
  then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'running_order_published', 'show', new.id,
      'Running order published for ' || new.name,
      'The performance order is now public.',
      '/shows/' || new.id::text,
      'normal',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':running-order'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  if coalesce((new_config ->> 'results')::boolean, false)
    and (not old_show_was_public or not coalesce((old_config ->> 'results')::boolean, false))
  then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'results_published', 'show', new.id,
      'Results published for ' || new.name,
      'The scoreboard, jury total and televote total are now public.',
      '/shows/' || new.id::text,
      'important',
      jsonb_build_object(
        'showId', new.id,
        'editionId', new.edition_id,
        'editionSlug', edition_slug,
        'countryIds', country_ids,
        'contestEntityIds', contest_entity_ids
      ),
      now(), 'show:' || new.id::text || ':results'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_emit_show_pulse_events on public.shows;
create trigger trg_emit_show_pulse_events
after insert or update on public.shows
for each row execute function public.emit_show_pulse_events();

create or replace function public.emit_prediction_round_pulse_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  show_name text;
  edition_id uuid;
  edition_slug text;
begin
  if not public.show_publication_enabled(new.show_id, 'participants') then return new; end if;

  select show_row.name, show_row.edition_id, edition.slug
  into show_name, edition_id, edition_slug
  from public.shows show_row
  join public.editions edition on edition.id = show_row.edition_id
  where show_row.id = new.show_id;

  if new.status = 'open' then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'prediction_opened', 'show', new.show_id,
      'Predictions are open for ' || coalesce(show_name, 'this show'),
      'Make or revise your prediction before the lock time.',
      '/predictions/' || new.show_id::text,
      'normal',
      jsonb_build_object(
        'roundId', new.id, 'showId', new.show_id,
        'editionId', edition_id, 'editionSlug', edition_slug,
        'locksAt', new.locks_at
      ),
      greatest(new.opens_at, now()),
      'prediction:' || new.id::text || ':opened'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload,
      published_at = least(public.content_events.published_at, excluded.published_at);

    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'prediction_locked', 'show', new.show_id,
      'Predictions locked for ' || coalesce(show_name, 'this show'),
      'The prediction deadline has passed. Consensus can now be compared safely.',
      '/predictions/' || new.show_id::text,
      'important',
      jsonb_build_object(
        'roundId', new.id, 'showId', new.show_id,
        'editionId', edition_id, 'editionSlug', edition_slug,
        'locksAt', new.locks_at
      ),
      new.locks_at,
      'prediction:' || new.id::text || ':locked'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload,
      published_at = excluded.published_at;
  elsif new.status in ('locked', 'scoring', 'scored') then
    insert into public.content_events (
      event_type, entity_type, entity_id, title, summary, route,
      importance, payload, published_at, dedupe_key
    ) values (
      'prediction_locked', 'show', new.show_id,
      'Predictions locked for ' || coalesce(show_name, 'this show'),
      'The prediction deadline has passed. Consensus can now be compared safely.',
      '/predictions/' || new.show_id::text,
      'important',
      jsonb_build_object(
        'roundId', new.id, 'showId', new.show_id,
        'editionId', edition_id, 'editionSlug', edition_slug,
        'locksAt', new.locks_at
      ),
      least(new.locks_at, now()),
      'prediction:' || new.id::text || ':locked'
    )
    on conflict (dedupe_key) do update set
      title = excluded.title, summary = excluded.summary,
      route = excluded.route, payload = excluded.payload,
      published_at = least(public.content_events.published_at, excluded.published_at);
  elsif new.status = 'cancelled' then
    delete from public.content_events event
    where event.dedupe_key = 'prediction:' || new.id::text || ':locked'
      and event.published_at > now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_emit_prediction_round_pulse_events on public.prediction_rounds;
create trigger trg_emit_prediction_round_pulse_events
after insert or update on public.prediction_rounds
for each row execute function public.emit_prediction_round_pulse_events();

alter table public.prediction_consensus_snapshots enable row level security;
grant all on public.prediction_consensus_snapshots to service_role;

create or replace function public.capture_prediction_consensus_snapshot(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  round_row public.prediction_rounds%rowtype;
  sample_size integer;
  aggregate_payload jsonb;
  payload_hash text;
begin
  select * into round_row from public.prediction_rounds where id = _round_id;
  if round_row.id is null then return; end if;

  select count(*)::integer into sample_size
  from public.prediction_entries entry
  where entry.round_id = _round_id and entry.state in ('submitted', 'locked', 'scored');
  if sample_size < round_row.consensus_minimum then return; end if;

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
    where entry.round_id = _round_id and entry.state in ('submitted', 'locked', 'scored')
    group by item.prediction_type, item.country_id
  ) grouped;

  payload_hash := md5(sample_size::text || ':' || aggregate_payload::text);
  insert into public.prediction_consensus_snapshots (
    round_id, sample_size, items, snapshot_hash, captured_at
  ) values (_round_id, sample_size, aggregate_payload, payload_hash, now())
  on conflict (round_id, snapshot_hash) do nothing;
end;
$$;

revoke all on function public.capture_prediction_consensus_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.capture_prediction_consensus_snapshot(uuid) to service_role;

create or replace function public.capture_prediction_snapshot_after_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare round_id_value uuid;
begin
  select entry.round_id into round_id_value
  from public.prediction_entries entry
  where entry.id = new.entry_id;

  if round_id_value is not null then
    perform public.capture_prediction_consensus_snapshot(round_id_value);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_prediction_consensus_snapshot on public.prediction_entry_versions;
create trigger trg_capture_prediction_consensus_snapshot
after insert on public.prediction_entry_versions
for each row execute function public.capture_prediction_snapshot_after_submission();

create or replace function public.prediction_consensus_movement(_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  round_row public.prediction_rounds%rowtype;
  current_sample_size integer;
  snapshots jsonb := '[]'::jsonb;
  snapshot_count integer := 0;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select * into round_row from public.prediction_rounds where id = _round_id;
  if round_row.id is null then raise exception 'Prediction round not found'; end if;

  if not public.show_publication_enabled(round_row.show_id, 'participants')
    and not public.has_role(current_user_id, 'organizer'::public.app_role)
  then raise exception 'Prediction round is not published'; end if;

  if round_row.status in ('draft', 'cancelled')
    and not public.has_role(current_user_id, 'organizer'::public.app_role)
  then raise exception 'Prediction round is unavailable'; end if;

  if now() < round_row.locks_at
    and not exists (
      select 1 from public.prediction_entries entry
      where entry.round_id = _round_id
        and entry.profile_id = current_user_id
        and entry.state in ('submitted', 'locked', 'scored')
    )
  then raise exception 'Submit a prediction before viewing consensus movement'; end if;

  select count(*)::integer into current_sample_size
  from public.prediction_entries entry
  where entry.round_id = _round_id and entry.state in ('submitted', 'locked', 'scored');

  if current_sample_size < round_row.consensus_minimum then
    return jsonb_build_object('ready', false, 'minimum', round_row.consensus_minimum, 'snapshots', '[]'::jsonb);
  end if;

  perform public.capture_prediction_consensus_snapshot(_round_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'capturedAt', snapshot.captured_at,
        'sampleSize', snapshot.sample_size,
        'items', snapshot.items
      ) order by snapshot.captured_at desc, snapshot.id desc
    ),
    '[]'::jsonb
  ) into snapshots
  from (
    select * from public.prediction_consensus_snapshots
    where round_id = _round_id
    order by captured_at desc, id desc
    limit 2
  ) snapshot;

  snapshot_count := jsonb_array_length(snapshots);
  return jsonb_build_object(
    'ready', snapshot_count >= 2,
    'minimum', round_row.consensus_minimum,
    'snapshots', snapshots
  );
end;
$$;

revoke all on function public.prediction_consensus_movement(uuid) from public, anon;
grant execute on function public.prediction_consensus_movement(uuid) to authenticated, service_role;
