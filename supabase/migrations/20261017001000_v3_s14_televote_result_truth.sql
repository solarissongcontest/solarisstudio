begin;

-- System V3 / S14: make the published Televoting result the source of the
-- canonical Solaris televote projection consumed by Studio Results.
--
-- public.televote_votes is the show-scoped aggregate recipient-points
-- projection (not the raw Televoting ballot ledger). Published round/Combined
-- results now materialize that projection transactionally with exact source
-- version provenance before Studio result readiness/recalculation consumes it.

create table if not exists private.v3_televote_result_projection_sources (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_type text not null check (source_type in ('round', 'combined')),
  source_id text not null check (length(btrim(source_id)) between 1 and 160),
  source_version integer not null check (source_version >= 1),
  source_published_at timestamptz not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count >= 1 and row_count <= 500),
  points_total bigint not null check (points_total >= 0),
  projection_revision bigint not null check (projection_revision >= 1),
  synced_at timestamptz not null default now()
);

revoke all on table private.v3_televote_result_projection_sources
  from public, anon, authenticated;

create or replace function private.v3_apply_published_televote_projection(
  p_edition_id uuid,
  p_show_id uuid,
  p_source_type text,
  p_source_id text,
  p_source_version integer,
  p_source_published_at timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_show_edition uuid;
  v_participant_count integer := 0;
  v_row_count integer := 0;
  v_distinct_identity_count integer := 0;
  v_points_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_existing private.v3_televote_result_projection_sources%rowtype;
  v_revision bigint := 1;
  v_replayed boolean := false;
begin
  if p_edition_id is null or p_show_id is null then
    raise exception 'Televote projection requires edition and show identity'
      using errcode = '22023';
  end if;
  if p_source_type not in ('round', 'combined')
     or nullif(btrim(coalesce(p_source_id, '')), '') is null
     or length(p_source_id) > 160
     or p_source_version is null
     or p_source_version < 1
     or p_source_published_at is null then
    raise exception 'Televote projection source identity is invalid'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 500
     or pg_column_size(p_rows) > 65536 then
    raise exception 'Televote projection rows must be a bounded non-empty array'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_show_edition
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition is null then
    raise exception 'Televote projection show does not exist'
      using errcode = 'P0002';
  end if;
  if v_show_edition is distinct from p_edition_id then
    raise exception 'Televote projection show belongs to a different edition'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
       or item - array['country_id', 'contest_entity_id', 'points']::text[] <> '{}'::jsonb
       or (
         nullif(item ->> 'country_id', '') is null
         and nullif(item ->> 'contest_entity_id', '') is null
       )
       or coalesce(item ->> 'points', '') !~ '^[0-9]+$'
       or (item ->> 'points')::numeric > 2147483647
  ) then
    raise exception 'Televote projection row is invalid'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'country_id', normalized.country_id,
        'contest_entity_id', normalized.contest_entity_id,
        'points', normalized.points
      )
      order by coalesce(normalized.country_id::text, normalized.contest_entity_id::text)
    ),
    '[]'::jsonb
  ),
  count(*)::integer,
  count(distinct coalesce(normalized.country_id, normalized.contest_entity_id))::integer,
  coalesce(sum(normalized.points), 0)::bigint
  into v_rows, v_row_count, v_distinct_identity_count, v_points_total
  from (
    select
      nullif(item ->> 'country_id', '')::uuid as country_id,
      nullif(item ->> 'contest_entity_id', '')::uuid as contest_entity_id,
      (item ->> 'points')::integer as points
    from jsonb_array_elements(p_rows) item
  ) normalized;

  if v_row_count <> v_distinct_identity_count then
    raise exception 'Televote projection contains duplicate recipient identities'
      using errcode = '23505';
  end if;

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  if v_participant_count < 1 or v_row_count <> v_participant_count then
    raise exception 'Published Televote lineup does not exactly match the Solaris show'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows)
      as incoming(country_id uuid, contest_entity_id uuid, points integer)
    where not exists (
      select 1
      from public.participants participant
      where participant.show_id = p_show_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and coalesce(participant.country_id, participant.contest_entity_id)
          = coalesce(incoming.country_id, incoming.contest_entity_id)
        and (
          incoming.country_id is null
          or participant.country_id is not distinct from incoming.country_id
        )
        and (
          incoming.contest_entity_id is null
          or participant.contest_entity_id is not distinct from incoming.contest_entity_id
        )
    )
  ) then
    raise exception 'Published Televote recipient is outside the bound Solaris show lineup'
      using errcode = '23514';
  end if;

  v_fingerprint := encode(
    extensions.digest(convert_to(v_rows::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('v3-televote-result-projection:' || p_show_id::text, 0)
  );

  select source.*
  into v_existing
  from private.v3_televote_result_projection_sources source
  where source.show_id = p_show_id
  for update;

  if v_existing.show_id is not null then
    if v_existing.source_type = p_source_type
       and v_existing.source_id = p_source_id then
      if p_source_version < v_existing.source_version then
        raise exception 'STALE_VERSION: published Televote source version is older than the canonical projection'
          using errcode = '40001';
      elsif p_source_version = v_existing.source_version then
        if v_fingerprint is distinct from v_existing.payload_fingerprint then
          raise exception 'IDEMPOTENCY_CONFLICT: published Televote source version changed semantics'
            using errcode = 'P0001';
        end if;
        v_revision := v_existing.projection_revision;
        v_replayed := true;
      else
        if p_source_published_at < v_existing.source_published_at then
          raise exception 'STALE_VERSION: newer source version has an older publication epoch'
            using errcode = '40001';
        end if;
        v_revision := v_existing.projection_revision + 1;
      end if;
    else
      if p_source_published_at <= v_existing.source_published_at then
        raise exception 'STALE_VERSION: an older published Televote source cannot replace the canonical projection'
          using errcode = '40001';
      end if;
      v_revision := v_existing.projection_revision + 1;
    end if;
  end if;

  perform set_config('solaris.v3_televote_projection_write', '1', true);

  delete from public.televote_votes vote
  where vote.show_id = p_show_id;

  insert into public.televote_votes (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    points
  )
  select
    p_edition_id,
    p_show_id,
    incoming.country_id,
    incoming.contest_entity_id,
    incoming.points
  from jsonb_to_recordset(v_rows)
    as incoming(country_id uuid, contest_entity_id uuid, points integer);

  insert into private.v3_televote_result_projection_sources (
    show_id,
    edition_id,
    source_type,
    source_id,
    source_version,
    source_published_at,
    payload_fingerprint,
    row_count,
    points_total,
    projection_revision,
    synced_at
  ) values (
    p_show_id,
    p_edition_id,
    p_source_type,
    p_source_id,
    p_source_version,
    p_source_published_at,
    v_fingerprint,
    v_row_count,
    v_points_total,
    v_revision,
    now()
  )
  on conflict (show_id) do update
  set edition_id = excluded.edition_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      source_version = excluded.source_version,
      source_published_at = excluded.source_published_at,
      payload_fingerprint = excluded.payload_fingerprint,
      row_count = excluded.row_count,
      points_total = excluded.points_total,
      projection_revision = excluded.projection_revision,
      synced_at = excluded.synced_at;

  perform public.sync_show_results_from_votes(p_show_id);

  return jsonb_build_object(
    'ok', true,
    'showId', p_show_id,
    'sourceType', p_source_type,
    'sourceId', p_source_id,
    'sourceVersion', p_source_version,
    'projectionRevision', v_revision,
    'rowCount', v_row_count,
    'pointsTotal', v_points_total,
    'replayed', v_replayed
  );
end
$apply$;

revoke all on function private.v3_apply_published_televote_projection(
  uuid, uuid, text, text, integer, timestamptz, jsonb
) from public, anon, authenticated;

create or replace function private.v3_sync_published_televote_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $round_sync$
declare
  v_round televoting.rounds%rowtype;
  v_binding public.televoting_round_bindings%rowtype;
  v_source_count integer := 0;
  v_matched_count integer := 0;
  v_participant_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null
     or v_round.results_status <> 'published'
     or coalesce(v_round.results_outdated, false) then
    return jsonb_build_object('ok', false, 'status', 'source_not_published');
  end if;

  if v_round.broadcast_display_mode = 'combined' then
    return jsonb_build_object('ok', false, 'status', 'waiting_for_combined');
  end if;

  select binding.*
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  if v_binding.remote_round_id is null or v_binding.show_id is null then
    return jsonb_build_object('ok', false, 'status', 'unbound_show');
  end if;

  if not exists (
    select 1 from public.shows show_row
    where show_row.id = v_binding.show_id
      and show_row.edition_id = v_binding.edition_id
  ) then
    raise exception 'Televoting round binding does not resolve to its declared Solaris edition/show'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_source_count
  from televoting.round_results result_row
  where result_row.round_id = p_round_id
    and result_row.calculation_version = v_round.calculation_version;

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = v_binding.show_id
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'country_id', participant.country_id,
               'contest_entity_id', participant.contest_entity_id,
               'points', result_row.final_points
             )
             order by coalesce(participant.country_id::text, participant.contest_entity_id::text)
           ),
           '[]'::jsonb
         )
  into v_matched_count, v_rows
  from televoting.round_results result_row
  join public.countries country
    on upper(btrim(country.short_code)) = upper(btrim(result_row.country_code))
  join public.participants participant
    on participant.show_id = v_binding.show_id
   and participant.country_id = country.id
   and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
  where result_row.round_id = p_round_id
    and result_row.calculation_version = v_round.calculation_version;

  if v_source_count <> v_participant_count
     or v_matched_count <> v_participant_count then
    raise exception 'Published Televoting round lineup does not exactly match the bound Solaris show'
      using errcode = '23514';
  end if;

  return private.v3_apply_published_televote_projection(
    v_binding.edition_id,
    v_binding.show_id,
    'round',
    p_round_id::text,
    v_round.calculation_version,
    coalesce(v_round.calculated_at, v_round.updated_at, now()),
    v_rows
  );
end
$round_sync$;

revoke all on function private.v3_sync_published_televote_round(uuid)
  from public, anon, authenticated;

create or replace function private.v3_sync_published_televote_aggregation(p_aggregation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $combined_sync$
declare
  v_aggregation televoting.televote_aggregations%rowtype;
  v_source_round_count integer := 0;
  v_bound_round_count integer := 0;
  v_target_count integer := 0;
  v_edition_id uuid;
  v_show_id uuid;
  v_source_count integer := 0;
  v_matched_count integer := 0;
  v_participant_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  if v_aggregation.id is null
     or v_aggregation.status <> 'published'
     or coalesce(v_aggregation.results_outdated, false) then
    return jsonb_build_object('ok', false, 'status', 'source_not_published');
  end if;

  with source_rounds as (
    select distinct source.source_round_id
    from televoting.televote_aggregation_sources source
    where source.aggregation_id = p_aggregation_id
      and source.enabled
      and source.source_round_id is not null
  ), targets as (
    select binding.edition_id, binding.show_id
    from source_rounds source
    left join public.televoting_round_bindings binding
      on binding.remote_round_id = source.source_round_id::text
  )
  select
    (select count(*) from source_rounds)::integer,
    count(*) filter (where targets.show_id is not null)::integer,
    count(distinct targets.edition_id::text || ':' || targets.show_id::text)
      filter (where targets.show_id is not null)::integer,
    min(targets.edition_id::text) filter (where targets.show_id is not null)::uuid,
    min(targets.show_id::text) filter (where targets.show_id is not null)::uuid
  into v_source_round_count, v_bound_round_count, v_target_count, v_edition_id, v_show_id
  from targets;

  if v_source_round_count < 1
     or v_bound_round_count <> v_source_round_count
     or v_target_count <> 1
     or v_show_id is null then
    return jsonb_build_object('ok', false, 'status', 'unbound_show');
  end if;

  if not exists (
    select 1 from public.shows show_row
    where show_row.id = v_show_id
      and show_row.edition_id = v_edition_id
  ) then
    raise exception 'Combined Televote bindings do not resolve to their declared Solaris edition/show'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_source_count
  from televoting.combined_televote_results result_row
  where result_row.aggregation_id = p_aggregation_id
    and result_row.calculation_version = v_aggregation.calculation_version;

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = v_show_id
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'country_id', participant.country_id,
               'contest_entity_id', participant.contest_entity_id,
               'points', result_row.final_combined_points::integer
             )
             order by coalesce(participant.country_id::text, participant.contest_entity_id::text)
           ),
           '[]'::jsonb
         )
  into v_matched_count, v_rows
  from televoting.combined_televote_results result_row
  join public.countries country
    on upper(btrim(country.short_code)) = upper(btrim(result_row.country_code))
  join public.participants participant
    on participant.show_id = v_show_id
   and participant.country_id = country.id
   and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
  where result_row.aggregation_id = p_aggregation_id
    and result_row.calculation_version = v_aggregation.calculation_version;

  if v_source_count <> v_participant_count
     or v_matched_count <> v_participant_count then
    raise exception 'Published Combined Televote lineup does not exactly match the bound Solaris show'
      using errcode = '23514';
  end if;

  return private.v3_apply_published_televote_projection(
    v_edition_id,
    v_show_id,
    'combined',
    p_aggregation_id::text,
    v_aggregation.calculation_version,
    coalesce(v_aggregation.published_at, v_aggregation.calculated_at, v_aggregation.updated_at, now()),
    v_rows
  );
end
$combined_sync$;

revoke all on function private.v3_sync_published_televote_aggregation(uuid)
  from public, anon, authenticated;

create or replace function private.v3_guard_source_managed_televote_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_show_id uuid;
begin
  if tg_op = 'DELETE' then
    v_show_id := old.show_id;
  else
    v_show_id := new.show_id;
  end if;

  if coalesce(current_setting('solaris.v3_televote_projection_write', true), '') = '1'
     or private.studio2_request_is_service_role()
     or session_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_show_id is not null
     and exists (
       select 1
       from private.v3_televote_result_projection_sources source
       where source.show_id = v_show_id
     ) then
    raise exception 'Published Televote projection is server-managed for this show'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_source_managed_televote_projection()
  from public, anon, authenticated;

drop trigger if exists v3_guard_source_managed_televote_projection
  on public.televote_votes;
create trigger v3_guard_source_managed_televote_projection
before insert or update or delete on public.televote_votes
for each row execute function private.v3_guard_source_managed_televote_projection();

create or replace function private.v3_sync_published_televote_round_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $trigger$
begin
  if new.results_status <> 'published'
     or coalesce(new.results_outdated, false)
     or new.broadcast_display_mode = 'combined' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.v3_sync_published_televote_round(new.id);
  elsif old.results_status is distinct from new.results_status
     or old.calculation_version is distinct from new.calculation_version
     or old.results_outdated is distinct from new.results_outdated
     or old.broadcast_display_mode is distinct from new.broadcast_display_mode then
    perform private.v3_sync_published_televote_round(new.id);
  end if;

  return new;
end
$trigger$;

revoke all on function private.v3_sync_published_televote_round_trigger()
  from public, anon, authenticated;

drop trigger if exists v3_sync_published_televote_round
  on televoting.rounds;
create trigger v3_sync_published_televote_round
after insert or update of results_status, calculation_version, results_outdated, broadcast_display_mode
on televoting.rounds
for each row execute function private.v3_sync_published_televote_round_trigger();

create or replace function private.v3_sync_published_televote_aggregation_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $trigger$
begin
  if new.status <> 'published'
     or coalesce(new.results_outdated, false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.v3_sync_published_televote_aggregation(new.id);
  elsif old.status is distinct from new.status
     or old.calculation_version is distinct from new.calculation_version
     or old.results_outdated is distinct from new.results_outdated
     or old.published_at is distinct from new.published_at then
    perform private.v3_sync_published_televote_aggregation(new.id);
  end if;

  return new;
end
$trigger$;

revoke all on function private.v3_sync_published_televote_aggregation_trigger()
  from public, anon, authenticated;

drop trigger if exists v3_sync_published_televote_aggregation
  on televoting.televote_aggregations;
create trigger v3_sync_published_televote_aggregation
after insert or update of status, calculation_version, results_outdated, published_at
on televoting.televote_aggregations
for each row execute function private.v3_sync_published_televote_aggregation_trigger();

create or replace function public.studio2_televote_projection_status(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $status$
declare
  v_source private.v3_televote_result_projection_sources%rowtype;
  v_edition_id uuid;
begin
  select show_row.edition_id into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not private.studio2_request_is_service_role()
     and not public.studio2_access_allowed('voting.read', v_edition_id, false)
     and not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: voting.read'
      using errcode = '42501';
  end if;

  select source.* into v_source
  from private.v3_televote_result_projection_sources source
  where source.show_id = p_show_id;

  if v_source.show_id is null then
    return jsonb_build_object(
      'showId', p_show_id,
      'managed', false,
      'televoteVoteRows', (select count(*) from public.televote_votes vote where vote.show_id = p_show_id)
    );
  end if;

  return jsonb_build_object(
    'showId', p_show_id,
    'managed', true,
    'sourceType', v_source.source_type,
    'sourceId', v_source.source_id,
    'sourceVersion', v_source.source_version,
    'sourcePublishedAt', v_source.source_published_at,
    'projectionRevision', v_source.projection_revision,
    'rowCount', v_source.row_count,
    'pointsTotal', v_source.points_total,
    'syncedAt', v_source.synced_at,
    'televoteVoteRows', (select count(*) from public.televote_votes vote where vote.show_id = p_show_id)
  );
end
$status$;

revoke all on function public.studio2_televote_projection_status(uuid)
  from public, anon;
grant execute on function public.studio2_televote_projection_status(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
