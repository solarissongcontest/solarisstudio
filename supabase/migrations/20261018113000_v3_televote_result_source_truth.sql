begin;

-- Canonical Studio Results must consume the same published, versioned Televote
-- truth that the server publication bridge writes. Keep public.televote_votes
-- only as a legacy fallback for shows that have never crossed that bridge.
create table if not exists public.studio2_televote_result_imports (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_type text not null check (source_type in ('round', 'combined')),
  source_id text not null,
  source_version bigint not null check (source_version >= 0),
  source_round_ids text[] not null default '{}'::text[],
  points jsonb not null check (jsonb_typeof(points) = 'object'),
  source_event_id uuid not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio2_televote_result_imports_edition_idx
  on public.studio2_televote_result_imports (edition_id, updated_at desc);
create index if not exists studio2_televote_result_imports_source_idx
  on public.studio2_televote_result_imports (source_type, source_id, source_version);

alter table public.studio2_televote_result_imports enable row level security;
revoke all on table public.studio2_televote_result_imports
  from public, anon, authenticated;
grant select, insert, update, delete on table public.studio2_televote_result_imports
  to service_role;

-- Resolve one exact live Televote source version from the same tables consumed
-- by results-sync.server.ts. No browser role receives access through this helper.
create or replace function private.studio2_televote_source_snapshot(
  p_source_type text,
  p_source_id text,
  p_show_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $snapshot$
declare
  v_source_uuid uuid;
  v_show public.shows%rowtype;
  v_source_version bigint;
  v_source_current boolean := false;
  v_points jsonb := '{}'::jsonb;
  v_round_ids text[] := '{}'::text[];
  v_source_rows integer := 0;
  v_mapped_rows integer := 0;
  v_bound_rows integer := 0;
begin
  if p_show_id is null or nullif(btrim(coalesce(p_source_id, '')), '') is null then
    return jsonb_build_object('current', false, 'reason', 'missing_source_identity');
  end if;
  if p_source_type not in ('round', 'combined') then
    return jsonb_build_object('current', false, 'reason', 'unsupported_source_type');
  end if;

  begin
    v_source_uuid := p_source_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('current', false, 'reason', 'invalid_source_id');
  end;

  select * into v_show from public.shows where id = p_show_id;
  if not found then
    return jsonb_build_object('current', false, 'reason', 'show_not_found');
  end if;

  if p_source_type = 'round' then
    select round.calculation_version::bigint,
           (round.results_status = 'published' and not coalesce(round.results_outdated, false))
      into v_source_version, v_source_current
    from televoting.rounds round
    where round.id = v_source_uuid;

    if not found then
      return jsonb_build_object('current', false, 'reason', 'source_not_found');
    end if;

    v_round_ids := array[v_source_uuid::text];

    select count(*)::integer
      into v_source_rows
    from televoting.round_results result
    where result.round_id = v_source_uuid
      and result.calculation_version = v_source_version;

    select count(*)::integer,
           coalesce(
             jsonb_object_agg(country.id::text, result.final_points order by country.id::text),
             '{}'::jsonb
           )
      into v_mapped_rows, v_points
    from televoting.round_results result
    join public.countries country
      on upper(country.short_code) = upper(result.country_code)
    where result.round_id = v_source_uuid
      and result.calculation_version = v_source_version;
  else
    select aggregation.calculation_version::bigint,
           (aggregation.status = 'published' and not coalesce(aggregation.results_outdated, false))
      into v_source_version, v_source_current
    from televoting.televote_aggregations aggregation
    where aggregation.id = v_source_uuid;

    if not found then
      return jsonb_build_object('current', false, 'reason', 'source_not_found');
    end if;

    select coalesce(
             array_agg(distinct source.source_round_id::text order by source.source_round_id::text),
             '{}'::text[]
           )
      into v_round_ids
    from televoting.televote_aggregation_sources source
    where source.aggregation_id = v_source_uuid
      and source.enabled
      and source.source_round_id is not null;

    select count(*)::integer
      into v_source_rows
    from televoting.combined_televote_results result
    where result.aggregation_id = v_source_uuid
      and result.calculation_version = v_source_version;

    select count(*)::integer,
           coalesce(
             jsonb_object_agg(country.id::text, result.final_combined_points order by country.id::text),
             '{}'::jsonb
           )
      into v_mapped_rows, v_points
    from televoting.combined_televote_results result
    join public.countries country
      on upper(country.short_code) = upper(result.country_code)
    where result.aggregation_id = v_source_uuid
      and result.calculation_version = v_source_version;
  end if;

  if cardinality(v_round_ids) = 0 then
    v_source_current := false;
  else
    select count(*)::integer
      into v_bound_rows
    from public.televoting_round_bindings binding
    where binding.remote_round_id = any(v_round_ids)
      and binding.edition_id = v_show.edition_id
      and binding.show_id = p_show_id;

    if v_bound_rows <> cardinality(v_round_ids) then
      v_source_current := false;
    end if;
  end if;

  if v_source_rows <= 0 or v_source_rows <> v_mapped_rows then
    v_source_current := false;
  end if;

  return jsonb_build_object(
    'current', v_source_current,
    'sourceType', p_source_type,
    'sourceId', p_source_id,
    'sourceVersion', v_source_version,
    'sourceRoundIds', to_jsonb(v_round_ids),
    'sourceRowCount', v_source_rows,
    'mappedRowCount', v_mapped_rows,
    'points', v_points,
    'editionId', v_show.edition_id,
    'showId', p_show_id
  );
end
$snapshot$;

revoke all on function private.studio2_televote_source_snapshot(text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_televote_source_snapshot(text, text, uuid)
  to service_role;

-- The publication bridge already records one completed integration event after
-- it has replaced the Televote component in public.results. Turn that existing
-- receipt into exact source-version evidence, but only after independently
-- proving source, bindings, lineup and result points all agree.
create or replace function private.studio2_capture_televote_result_import()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $capture$
declare
  v_source_type text;
  v_snapshot jsonb;
  v_points jsonb;
  v_round_ids text[] := '{}'::text[];
  v_expected_ids text[] := '{}'::text[];
  v_point_ids text[] := '{}'::text[];
  v_projection_matches integer := 0;
  v_result_rows integer := 0;
  v_existing public.studio2_televote_result_imports%rowtype;
begin
  if new.service <> 'televoting'
     or new.status <> 'completed'
     or new.entity_type <> 'show'
     or new.entity_id is null
     or new.event_type not in ('round.results.imported', 'combined.results.imported') then
    return new;
  end if;

  v_source_type := case
    when new.event_type = 'round.results.imported' then 'round'
    else 'combined'
  end;

  v_snapshot := private.studio2_televote_source_snapshot(
    v_source_type,
    new.remote_id,
    new.entity_id
  );

  if not coalesce((v_snapshot ->> 'current')::boolean, false) then
    raise exception 'Televote import source is not a current published source for show %', new.entity_id
      using errcode = '55000';
  end if;

  v_points := coalesce(v_snapshot -> 'points', '{}'::jsonb);

  select coalesce(array_agg(round_id order by round_id), '{}'::text[])
    into v_round_ids
  from jsonb_array_elements_text(
    coalesce(v_snapshot -> 'sourceRoundIds', '[]'::jsonb)
  ) as source_round(round_id);

  select coalesce(array_agg(identity_id order by identity_id), '{}'::text[])
    into v_expected_ids
  from (
    select coalesce(participant.country_id, participant.contest_entity_id)::text as identity_id
    from public.participants participant
    where participant.show_id = new.entity_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
      and coalesce(participant.country_id, participant.contest_entity_id) is not null
  ) expected;

  select coalesce(array_agg(key order by key), '{}'::text[])
    into v_point_ids
  from jsonb_object_keys(v_points) as point_key(key);

  if cardinality(v_expected_ids) = 0 or v_expected_ids is distinct from v_point_ids then
    raise exception 'Published Televote source lineup does not exactly match show %', new.entity_id
      using errcode = '55000';
  end if;

  select count(*)::integer
    into v_result_rows
  from public.results result
  where result.show_id = new.entity_id;

  select count(*)::integer
    into v_projection_matches
  from public.results result
  where result.show_id = new.entity_id
    and coalesce(result.country_id, result.contest_entity_id) is not null
    and v_points ? coalesce(result.country_id, result.contest_entity_id)::text
    and result.televote_points = (
      v_points ->> coalesce(result.country_id, result.contest_entity_id)::text
    )::integer;

  if v_result_rows <> cardinality(v_expected_ids)
     or v_projection_matches <> cardinality(v_expected_ids) then
    raise exception 'Solaris result projection does not match published Televote source version for show %', new.entity_id
      using errcode = '55000';
  end if;

  select * into v_existing
  from public.studio2_televote_result_imports import
  where import.show_id = new.entity_id
  for update;

  if found
     and v_existing.source_type = v_source_type
     and v_existing.source_id = new.remote_id
     and v_existing.source_version = (v_snapshot ->> 'sourceVersion')::bigint
     and v_existing.points is distinct from v_points then
    raise exception 'Published Televote source changed without advancing its calculation version'
      using errcode = 'PT409';
  end if;

  if found
     and v_existing.source_type = v_source_type
     and v_existing.source_id = new.remote_id
     and (v_snapshot ->> 'sourceVersion')::bigint < v_existing.source_version then
    raise exception 'Stale Televote source version cannot supersede the imported result version'
      using errcode = 'PT409';
  end if;

  insert into public.studio2_televote_result_imports (
    show_id, edition_id, source_type, source_id, source_version,
    source_round_ids, points, source_event_id, imported_at, updated_at
  ) values (
    new.entity_id,
    (v_snapshot ->> 'editionId')::uuid,
    v_source_type,
    new.remote_id,
    (v_snapshot ->> 'sourceVersion')::bigint,
    v_round_ids,
    v_points,
    new.id,
    coalesce(new.completed_at, now()),
    now()
  )
  on conflict (show_id) do update
  set edition_id = excluded.edition_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      source_version = excluded.source_version,
      source_round_ids = excluded.source_round_ids,
      points = excluded.points,
      source_event_id = excluded.source_event_id,
      imported_at = excluded.imported_at,
      updated_at = now();

  return new;
end
$capture$;

revoke all on function private.studio2_capture_televote_result_import()
  from public, anon, authenticated;

drop trigger if exists studio2_capture_televote_result_import
  on public.integration_events;
create trigger studio2_capture_televote_result_import
after insert or update of status, payload, remote_id, entity_id
on public.integration_events
for each row
execute function private.studio2_capture_televote_result_import();

-- Do not fabricate receipts for historical integration events during upgrade.
-- A fresh bridge replay is the proof that current source version and current
-- public.results still agree. S14 naturally creates this evidence locally.

-- Preserve the mature vote synchronization implementation as the legacy path,
-- then wrap it so any show with a canonical bridge receipt always restores the
-- imported aggregate Televote points after Jury/voting-config changes.
alter function public.sync_show_results_from_votes(uuid)
  rename to sync_show_results_from_votes_legacy_televote_votes;
revoke all on function public.sync_show_results_from_votes_legacy_televote_votes(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_show_results_from_votes_legacy_televote_votes(uuid)
  to service_role;

create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $sync$
declare
  v_points jsonb;
begin
  perform public.sync_show_results_from_votes_legacy_televote_votes(_show_id);

  select import.points
    into v_points
  from public.studio2_televote_result_imports import
  where import.show_id = _show_id;

  if found then
    update public.results result
    set televote_points = case
          when coalesce(result.country_id, result.contest_entity_id) is not null
               and v_points ? coalesce(result.country_id, result.contest_entity_id)::text
            then (v_points ->> coalesce(result.country_id, result.contest_entity_id)::text)::integer
          else 0
        end,
        updated_at = now()
    where result.show_id = _show_id;

    perform public.recalculate_show_results_internal(_show_id);
  end if;
end
$sync$;

revoke all on function public.sync_show_results_from_votes(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_show_results_from_votes(uuid)
  to service_role;

-- Independently verify that a receipt is still the current published source,
-- still has the exact show binding/lineup and still matches public.results.
create or replace function private.studio2_televote_import_status(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $status$
declare
  v_import public.studio2_televote_result_imports%rowtype;
  v_snapshot jsonb;
  v_live_round_ids text[] := '{}'::text[];
  v_expected_ids text[] := '{}'::text[];
  v_point_ids text[] := '{}'::text[];
  v_projection_matches integer := 0;
  v_result_rows integer := 0;
  v_ready boolean := false;
begin
  select * into v_import
  from public.studio2_televote_result_imports import
  where import.show_id = p_show_id;

  if not found then
    return jsonb_build_object('hasImport', false, 'ready', false);
  end if;

  v_snapshot := private.studio2_televote_source_snapshot(
    v_import.source_type,
    v_import.source_id,
    p_show_id
  );

  select coalesce(array_agg(round_id order by round_id), '{}'::text[])
    into v_live_round_ids
  from jsonb_array_elements_text(
    coalesce(v_snapshot -> 'sourceRoundIds', '[]'::jsonb)
  ) as source_round(round_id);

  select coalesce(array_agg(identity_id order by identity_id), '{}'::text[])
    into v_expected_ids
  from (
    select coalesce(participant.country_id, participant.contest_entity_id)::text as identity_id
    from public.participants participant
    where participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
      and coalesce(participant.country_id, participant.contest_entity_id) is not null
  ) expected;

  select coalesce(array_agg(key order by key), '{}'::text[])
    into v_point_ids
  from jsonb_object_keys(v_import.points) as point_key(key);

  select count(*)::integer
    into v_result_rows
  from public.results result
  where result.show_id = p_show_id;

  select count(*)::integer
    into v_projection_matches
  from public.results result
  where result.show_id = p_show_id
    and coalesce(result.country_id, result.contest_entity_id) is not null
    and v_import.points ? coalesce(result.country_id, result.contest_entity_id)::text
    and result.televote_points = (
      v_import.points ->> coalesce(result.country_id, result.contest_entity_id)::text
    )::integer;

  v_ready := coalesce((v_snapshot ->> 'current')::boolean, false)
    and (v_snapshot ->> 'sourceVersion')::bigint = v_import.source_version
    and coalesce(v_snapshot -> 'points', '{}'::jsonb) = v_import.points
    and v_live_round_ids = v_import.source_round_ids
    and cardinality(v_expected_ids) > 0
    and v_expected_ids = v_point_ids
    and v_result_rows = cardinality(v_expected_ids)
    and v_projection_matches = cardinality(v_expected_ids);

  return jsonb_build_object(
    'hasImport', true,
    'ready', v_ready,
    'sourceType', v_import.source_type,
    'sourceId', v_import.source_id,
    'sourceVersion', v_import.source_version,
    'sourceRoundIds', to_jsonb(v_import.source_round_ids),
    'evidenceRows', case when v_ready then cardinality(v_expected_ids) else 0 end,
    'sourceCurrent', coalesce((v_snapshot ->> 'current')::boolean, false),
    'sourceVersionCurrent', (v_snapshot ->> 'sourceVersion')::bigint,
    'lineupMatches', v_expected_ids = v_point_ids,
    'projectionMatches',
      v_result_rows = cardinality(v_expected_ids)
      and v_projection_matches = cardinality(v_expected_ids)
  );
end
$status$;

revoke all on function private.studio2_televote_import_status(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_televote_import_status(uuid)
  to service_role;

-- Keep the mature Jury/DNV implementation intact as the no-import fallback.
-- The canonical wrapper changes Televote readiness only when a publication
-- bridge receipt exists, and then fails closed on any stale source or drift.
alter function private.studio2_result_preconditions(uuid)
  rename to studio2_result_preconditions_legacy_televote_votes;
revoke all on function private.studio2_result_preconditions_legacy_televote_votes(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions_legacy_televote_votes(uuid)
  to service_role;

create or replace function private.studio2_result_preconditions(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preconditions$
declare
  v_base jsonb;
  v_import jsonb;
  v_import_ready boolean;
  v_jury_ready boolean;
  v_participant_count integer;
  v_televote_enabled boolean;
  v_base_result_ready boolean;
begin
  v_base := private.studio2_result_preconditions_legacy_televote_votes(p_show_id);
  v_import := private.studio2_televote_import_status(p_show_id);

  if not coalesce((v_import ->> 'hasImport')::boolean, false) then
    return v_base || jsonb_build_object(
      'televoteSource', 'legacy_votes',
      'televoteSourceType', null,
      'televoteSourceId', null,
      'televoteSourceVersion', null
    );
  end if;

  v_import_ready := coalesce((v_import ->> 'ready')::boolean, false);
  v_jury_ready := coalesce((v_base ->> 'juryReady')::boolean, false);
  v_participant_count := coalesce((v_base ->> 'participantCount')::integer, 0);
  v_televote_enabled := coalesce((v_base ->> 'televoteEnabled')::boolean, true);
  v_base_result_ready := coalesce((v_base ->> 'resultReady')::boolean, false);

  return v_base || jsonb_build_object(
    'televoteVoteRows',
      case when v_import_ready then coalesce((v_import ->> 'evidenceRows')::integer, 0) else 0 end,
    'televoteReady', (not v_televote_enabled) or v_import_ready,
    'calculationReady',
      v_participant_count > 0
      and v_jury_ready
      and ((not v_televote_enabled) or v_import_ready),
    'resultReady', v_base_result_ready and ((not v_televote_enabled) or v_import_ready),
    'televoteSource', 'published_import',
    'televoteSourceType', v_import ->> 'sourceType',
    'televoteSourceId', v_import ->> 'sourceId',
    'televoteSourceVersion', (v_import ->> 'sourceVersion')::bigint,
    'televoteSourceCurrent', coalesce((v_import ->> 'sourceCurrent')::boolean, false),
    'televoteLineupMatches', coalesce((v_import ->> 'lineupMatches')::boolean, false),
    'televoteProjectionMatches', coalesce((v_import ->> 'projectionMatches')::boolean, false)
  );
end
$preconditions$;

revoke all on function private.studio2_result_preconditions(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions(uuid)
  to service_role;

-- A source calculation/status change makes any reviewed/locked Studio result
-- version stale immediately, before a new bridge import is accepted.
create or replace function private.studio2_invalidate_result_review_for_show(p_show_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $invalidate$
begin
  update public.studio2_result_operations operation
  set reviewed_version = null,
      reviewed_at = null,
      reviewed_by = null,
      locked_version = null,
      locked_at = null,
      locked_by = null,
      reveal_ready_version = null,
      reveal_ready_at = null,
      reveal_ready_by = null,
      updated_at = now()
  where operation.show_id = p_show_id;
end
$invalidate$;

revoke all on function private.studio2_invalidate_result_review_for_show(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_invalidate_results_after_round_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $round_invalidate$
declare
  v_show_id uuid;
begin
  if old.calculation_version is not distinct from new.calculation_version
     and old.results_status is not distinct from new.results_status
     and old.results_outdated is not distinct from new.results_outdated then
    return new;
  end if;

  for v_show_id in
    select distinct binding.show_id
    from public.televoting_round_bindings binding
    where binding.remote_round_id = new.id::text
      and binding.show_id is not null
  loop
    perform private.studio2_invalidate_result_review_for_show(v_show_id);
  end loop;

  return new;
end
$round_invalidate$;

revoke all on function private.studio2_invalidate_results_after_round_source_change()
  from public, anon, authenticated;

drop trigger if exists studio2_invalidate_results_after_round_source_change
  on televoting.rounds;
create trigger studio2_invalidate_results_after_round_source_change
after update of calculation_version, results_status, results_outdated
on televoting.rounds
for each row
execute function private.studio2_invalidate_results_after_round_source_change();

create or replace function private.studio2_invalidate_results_after_combined_source_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $combined_invalidate$
declare
  v_show_id uuid;
begin
  if old.calculation_version is not distinct from new.calculation_version
     and old.status is not distinct from new.status
     and old.results_outdated is not distinct from new.results_outdated then
    return new;
  end if;

  for v_show_id in
    select distinct binding.show_id
    from televoting.televote_aggregation_sources source
    join public.televoting_round_bindings binding
      on binding.remote_round_id = source.source_round_id::text
    where source.aggregation_id = new.id
      and source.enabled
      and source.source_round_id is not null
      and binding.show_id is not null
  loop
    perform private.studio2_invalidate_result_review_for_show(v_show_id);
  end loop;

  return new;
end
$combined_invalidate$;

revoke all on function private.studio2_invalidate_results_after_combined_source_change()
  from public, anon, authenticated;

drop trigger if exists studio2_invalidate_results_after_combined_source_change
  on televoting.televote_aggregations;
create trigger studio2_invalidate_results_after_combined_source_change
after update of calculation_version, status, results_outdated
on televoting.televote_aggregations
for each row
execute function private.studio2_invalidate_results_after_combined_source_change();

notify pgrst, 'reload schema';

commit;
