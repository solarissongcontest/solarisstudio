begin;

-- S14 / #651: published Televoting results and Studio Results must share one
-- canonical, versioned source of truth. The browser never writes this state.
-- Existing legacy public.televote_votes remain a supported fallback for shows
-- that do not use the merged Televoting publisher.

create table private.v3_televote_result_imports (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null,
  show_id uuid not null,
  source_type text not null check (source_type in ('round', 'combined')),
  source_id text not null check (length(btrim(source_id)) between 1 and 160),
  source_version bigint not null check (source_version > 0),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count > 0),
  points_total bigint not null check (points_total >= 0),
  imported_at timestamptz not null default now(),
  source_event_id uuid references public.integration_events(id) on delete set null,
  constraint v3_televote_result_import_show_fk
    foreign key (show_id, edition_id)
    references public.shows(id, edition_id)
    on delete cascade,
  constraint v3_televote_result_import_source_version_uq
    unique (source_type, source_id, source_version)
);

create table private.v3_televote_result_import_rows (
  import_id uuid not null references private.v3_televote_result_imports(id) on delete cascade,
  identity_id uuid not null,
  country_id uuid references public.countries(id) on delete restrict,
  contest_entity_id uuid references public.contest_entities(id) on delete restrict,
  points integer not null check (points >= 0),
  primary key (import_id, identity_id),
  constraint v3_televote_result_import_row_identity_chk
    check (
      (country_id is not null or contest_entity_id is not null)
      and identity_id = coalesce(country_id, contest_entity_id)
    )
);

create table private.v3_televote_result_current (
  show_id uuid primary key,
  edition_id uuid not null,
  import_id uuid not null unique references private.v3_televote_result_imports(id) on delete restrict,
  source_type text not null check (source_type in ('round', 'combined')),
  source_id text not null,
  source_version bigint not null check (source_version > 0),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  constraint v3_televote_result_current_show_fk
    foreign key (show_id, edition_id)
    references public.shows(id, edition_id)
    on delete cascade
);

create index v3_televote_result_imports_show_version_idx
  on private.v3_televote_result_imports(show_id, imported_at desc);

revoke all on table private.v3_televote_result_imports from public, anon, authenticated;
revoke all on table private.v3_televote_result_import_rows from public, anon, authenticated;
revoke all on table private.v3_televote_result_current from public, anon, authenticated;
grant select on table private.v3_televote_result_imports to service_role;
grant select on table private.v3_televote_result_import_rows to service_role;
grant select on table private.v3_televote_result_current to service_role;

-- Preserve the exact pre-#651 implementations as legacy fallback engines.
alter function public.sync_show_results_from_votes(uuid)
  rename to sync_show_results_from_votes_legacy_vote_truth;
alter function private.studio2_result_preconditions(uuid)
  rename to studio2_result_preconditions_legacy_vote_truth;

revoke all on function public.sync_show_results_from_votes_legacy_vote_truth(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_result_preconditions_legacy_vote_truth(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions_legacy_vote_truth(uuid)
  to service_role;

-- Re-rank the already materialized score components while considering only
-- active participants. This deliberately does not reconstruct Televote points.
create or replace function public.recalculate_show_results_internal(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $recalculate$
declare
  v_config jsonb;
  v_jury_weight numeric;
  v_televote_weight numeric;
  v_weighted boolean;
  v_updated integer := 0;
begin
  select coalesce(show_row.voting_config, '{}'::jsonb)
    into v_config
  from public.shows show_row
  where show_row.id = _show_id;

  if v_config is null then
    return 0;
  end if;

  v_weighted := coalesce((v_config ->> 'weightedScoring')::boolean, false);
  v_jury_weight := coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50) / 50.0;
  v_televote_weight := coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50) / 50.0;

  with jury_scale as (
    select coalesce(max(value::numeric), 12) as max_score
    from jsonb_array_elements_text(
      coalesce(v_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb)
    ) as point(value)
  ),
  point_counts as (
    select
      coalesce(vote.receiving_country_id, vote.receiving_entity_id) as identity_id,
      vote.points::numeric as score,
      count(*)::numeric as cnt
    from public.jury_votes vote
    where vote.show_id = _show_id
      and (
        vote.ballot_submission_id is null
        or exists (
          select 1
          from public.jury_ballot_submissions submission
          where submission.id = vote.ballot_submission_id
            and submission.status = 'valid'
        )
      )
    group by coalesce(vote.receiving_country_id, vote.receiving_entity_id), vote.points
  ),
  jury_meta as (
    select
      counts.identity_id,
      coalesce(sum(counts.cnt) filter (where counts.score = scale.max_score), 0)::numeric as top_awards,
      coalesce(
        sum(counts.cnt * power(1000::numeric, greatest(0, 20 - counts.score::integer))),
        0
      )::numeric as countback_score
    from point_counts counts
    cross join jury_scale scale
    group by counts.identity_id
  ),
  base as (
    select
      result.id,
      result.country_id,
      result.contest_entity_id,
      result.jury_points::numeric as jury_points,
      result.televote_points::numeric as televote_points,
      case
        when v_weighted then round(
          result.jury_points * v_jury_weight
          + result.televote_points * v_televote_weight
        )::integer
        else (result.jury_points + result.televote_points)::integer
      end as total_points,
      result.final_rank as old_rank,
      participant.running_order,
      coalesce(meta.top_awards, 0) as top_awards,
      coalesce(meta.countback_score, 0) as countback_score,
      coalesce(v_config -> 'tieBreak', '["televote","twelves","jury"]'::jsonb) as tie_break
    from public.results result
    join public.participants participant
      on participant.show_id = result.show_id
     and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
     and coalesce(participant.country_id, participant.contest_entity_id)
         = coalesce(result.country_id, result.contest_entity_id)
    left join jury_meta meta
      on meta.identity_id = coalesce(result.country_id, result.contest_entity_id)
    where result.show_id = _show_id
  ),
  keyed as (
    select base_row.*,
      case coalesce(base_row.tie_break ->> 0, '') when 'jury' then base_row.jury_points when 'televote' then base_row.televote_points when 'twelves' then base_row.top_awards when 'countback' then base_row.countback_score when 'runningOrder' then coalesce(base_row.running_order, -1)::numeric else 0 end as k0,
      case coalesce(base_row.tie_break ->> 1, '') when 'jury' then base_row.jury_points when 'televote' then base_row.televote_points when 'twelves' then base_row.top_awards when 'countback' then base_row.countback_score when 'runningOrder' then coalesce(base_row.running_order, -1)::numeric else 0 end as k1,
      case coalesce(base_row.tie_break ->> 2, '') when 'jury' then base_row.jury_points when 'televote' then base_row.televote_points when 'twelves' then base_row.top_awards when 'countback' then base_row.countback_score when 'runningOrder' then coalesce(base_row.running_order, -1)::numeric else 0 end as k2,
      case coalesce(base_row.tie_break ->> 3, '') when 'jury' then base_row.jury_points when 'televote' then base_row.televote_points when 'twelves' then base_row.top_awards when 'countback' then base_row.countback_score when 'runningOrder' then coalesce(base_row.running_order, -1)::numeric else 0 end as k3,
      case coalesce(base_row.tie_break ->> 4, '') when 'jury' then base_row.jury_points when 'televote' then base_row.televote_points when 'twelves' then base_row.top_awards when 'countback' then base_row.countback_score when 'runningOrder' then coalesce(base_row.running_order, -1)::numeric else 0 end as k4
    from base base_row
  ),
  ranked as (
    select
      keyed_row.id,
      keyed_row.total_points,
      row_number() over (
        order by
          keyed_row.total_points desc,
          keyed_row.k0 desc,
          keyed_row.k1 desc,
          keyed_row.k2 desc,
          keyed_row.k3 desc,
          keyed_row.k4 desc,
          keyed_row.old_rank nulls last,
          keyed_row.country_id nulls last,
          keyed_row.contest_entity_id nulls last
      )::integer as new_rank
    from keyed keyed_row
  )
  update public.results result
  set total_points = ranked.total_points,
      final_rank = ranked.new_rank,
      updated_at = now()
  from ranked
  where result.id = ranked.id;

  get diagnostics v_updated = row_count;

  update public.results result
  set final_rank = null,
      updated_at = now()
  where result.show_id = _show_id
    and not exists (
      select 1
      from public.participants participant
      where participant.show_id = _show_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and coalesce(participant.country_id, participant.contest_entity_id)
            = coalesce(result.country_id, result.contest_entity_id)
    );

  return v_updated;
end
$recalculate$;

revoke all on function public.recalculate_show_results_internal(uuid)
  from public, anon, authenticated;

-- Legacy vote rows still drive legacy shows. For a show with a published import,
-- the immutable import projection wins and is re-applied after every Jury review
-- or other legacy synchronization attempt.
create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $sync$
declare
  v_import_id uuid;
begin
  perform public.sync_show_results_from_votes_legacy_vote_truth(_show_id);

  select current_import.import_id
    into v_import_id
  from private.v3_televote_result_current current_import
  where current_import.show_id = _show_id;

  if v_import_id is null then
    return;
  end if;

  update public.results result
  set televote_points = coalesce((
        select import_row.points
        from private.v3_televote_result_import_rows import_row
        where import_row.import_id = v_import_id
          and import_row.identity_id = coalesce(result.country_id, result.contest_entity_id)
      ), 0),
      updated_at = now()
  where result.show_id = _show_id;

  perform public.recalculate_show_results_internal(_show_id);
end
$sync$;

revoke all on function public.sync_show_results_from_votes(uuid)
  from public, anon, authenticated;

-- Keep all existing Jury/reconciliation precondition logic, then replace only
-- the Televote authority/readiness fields with the versioned published import
-- when one exists.
create or replace function private.studio2_result_preconditions(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preconditions$
declare
  v_base jsonb;
  v_current private.v3_televote_result_current%rowtype;
  v_import_rows integer := 0;
  v_participant_count integer := 0;
  v_legacy_rows integer := 0;
  v_televote_enabled boolean := true;
  v_jury_ready boolean := false;
  v_televote_ready boolean := false;
  v_calculation_ready boolean := false;
begin
  v_base := private.studio2_result_preconditions_legacy_vote_truth(p_show_id);

  v_participant_count := coalesce((v_base ->> 'participantCount')::integer, 0);
  v_legacy_rows := coalesce((v_base ->> 'televoteVoteRows')::integer, 0);
  v_televote_enabled := coalesce((v_base ->> 'televoteEnabled')::boolean, true);
  v_jury_ready := coalesce((v_base ->> 'juryReady')::boolean, false);

  select * into v_current
  from private.v3_televote_result_current current_import
  where current_import.show_id = p_show_id;

  if v_current.import_id is not null then
    select count(*)::integer into v_import_rows
    from private.v3_televote_result_import_rows import_row
    where import_row.import_id = v_current.import_id;
  end if;

  v_televote_ready := not v_televote_enabled
    or (
      v_current.import_id is not null
      and v_import_rows > 0
      and v_import_rows = v_participant_count
    )
    or (v_current.import_id is null and v_legacy_rows > 0);

  v_calculation_ready := v_participant_count > 0
    and v_jury_ready
    and v_televote_ready;

  return v_base || jsonb_build_object(
    'televoteReady', v_televote_ready,
    'calculationReady', v_calculation_ready,
    'televoteAuthority', case
      when v_current.import_id is not null then 'published_import'
      when v_legacy_rows > 0 then 'legacy_votes'
      else 'none'
    end,
    'televoteImportRows', v_import_rows,
    'televoteImportId', v_current.import_id,
    'televoteSourceType', v_current.source_type,
    'televoteSourceId', v_current.source_id,
    'televoteSourceVersion', v_current.source_version,
    'televoteSourceHash', v_current.payload_hash
  );
end
$preconditions$;

revoke all on function private.studio2_result_preconditions(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions(uuid)
  to service_role;

-- Result-version evidence must name the exact published Televote source used by
-- a calculation. Historical versions remain valid with null source fields.
alter table private.v3_result_versions
  add column televote_import_id uuid references private.v3_televote_result_imports(id) on delete restrict,
  add column televote_source_type text check (televote_source_type is null or televote_source_type in ('round', 'combined')),
  add column televote_source_id text,
  add column televote_source_version bigint check (televote_source_version is null or televote_source_version > 0),
  add column televote_source_hash text check (televote_source_hash is null or televote_source_hash ~ '^[0-9a-f]{64}$');

create or replace function private.v3_capture_result_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_rows jsonb;
  v_count integer;
  v_televote private.v3_televote_result_current%rowtype;
begin
  if new.calculation_version < 1
     or (tg_op = 'UPDATE' and new.calculation_version = old.calculation_version) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.calculation_version <> old.calculation_version + 1 then
    raise exception 'Result calculation versions must advance exactly once'
      using errcode = '23514';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'countryId', result.country_id,
          'contestEntityId', result.contest_entity_id,
          'juryPoints', result.jury_points,
          'televotePoints', result.televote_points,
          'televoteComponents', result.televote_components,
          'totalPoints', result.total_points,
          'finalRank', result.final_rank
        ) order by result.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_rows, v_count
  from public.results result
  where result.show_id = new.show_id
    and result.edition_id = new.edition_id;

  select * into v_televote
  from private.v3_televote_result_current current_import
  where current_import.show_id = new.show_id
    and current_import.edition_id = new.edition_id;

  insert into private.v3_result_versions (
    show_id,
    edition_id,
    version,
    result_rows,
    result_row_count,
    created_by,
    televote_import_id,
    televote_source_type,
    televote_source_id,
    televote_source_version,
    televote_source_hash
  ) values (
    new.show_id,
    new.edition_id,
    new.calculation_version,
    v_rows,
    v_count,
    new.last_calculated_by,
    v_televote.import_id,
    v_televote.source_type,
    v_televote.source_id,
    v_televote.source_version,
    v_televote.payload_hash
  );

  return new;
end
$capture$;

revoke all on function private.v3_capture_result_version()
  from public, anon, authenticated;

create or replace function private.v3_reconcile_published_televote_result(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $reconcile$
declare
  v_event public.integration_events%rowtype;
  v_edition_id uuid;
  v_show_id uuid;
  v_source_type text;
  v_source_id text;
  v_source_version bigint;
  v_round_ids text[] := array[]::text[];
  v_source_rows integer := 0;
  v_participant_rows integer := 0;
  v_mapped_rows integer := 0;
  v_distinct_rows integer := 0;
  v_points_total bigint := 0;
  v_normalized jsonb := '[]'::jsonb;
  v_hash text;
  v_existing private.v3_televote_result_imports%rowtype;
  v_current private.v3_televote_result_current%rowtype;
  v_import_id uuid;
begin
  select * into v_event
  from public.integration_events event
  where event.id = p_event_id
  for update;

  if v_event.id is null
     or v_event.service <> 'televoting'
     or v_event.status <> 'completed'
     or v_event.event_type not in ('round.results.imported', 'combined.results.imported')
     or nullif(btrim(coalesce(v_event.remote_id, '')), '') is null then
    return 'ignored';
  end if;

  v_source_id := v_event.remote_id;
  v_source_type := case
    when v_event.event_type = 'round.results.imported' then 'round'
    else 'combined'
  end;

  if v_source_type = 'round' then
    select round_row.calculation_version::bigint
      into v_source_version
    from televoting.rounds round_row
    where round_row.id::text = v_source_id
      and round_row.results_status = 'published'
      and not round_row.results_outdated;

    if v_source_version is null or v_source_version < 1 then
      raise exception 'Published Televoting round/version not found for %', v_source_id
        using errcode = 'P0002';
    end if;

    select binding.edition_id, binding.show_id
      into v_edition_id, v_show_id
    from public.televoting_round_bindings binding
    where binding.remote_round_id = v_source_id;

    if v_show_id is null then
      raise exception 'Published Televoting round is not bound to a Solaris show'
        using errcode = '23514';
    end if;

    v_round_ids := array[v_source_id];

    select count(*)::integer
      into v_source_rows
    from televoting.round_results source_result
    where source_result.round_id::text = v_source_id
      and source_result.calculation_version = v_source_version;

    select
      count(*)::integer,
      count(distinct coalesce(participant.country_id, participant.contest_entity_id))::integer,
      coalesce(sum(source_result.final_points), 0)::bigint,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'identityId', coalesce(participant.country_id, participant.contest_entity_id),
            'countryId', participant.country_id,
            'contestEntityId', participant.contest_entity_id,
            'points', source_result.final_points::integer
          ) order by coalesce(participant.country_id, participant.contest_entity_id)
        ),
        '[]'::jsonb
      )
    into v_mapped_rows, v_distinct_rows, v_points_total, v_normalized
    from televoting.round_results source_result
    join public.countries country
      on upper(country.short_code) = upper(source_result.country_code)
    join public.participants participant
      on participant.show_id = v_show_id
     and participant.country_id = country.id
     and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
    where source_result.round_id::text = v_source_id
      and source_result.calculation_version = v_source_version;
  else
    select aggregation.calculation_version::bigint
      into v_source_version
    from televoting.televote_aggregations aggregation
    where aggregation.id::text = v_source_id
      and aggregation.status = 'published'
      and not aggregation.results_outdated;

    if v_source_version is null or v_source_version < 1 then
      raise exception 'Published Combined Televote/version not found for %', v_source_id
        using errcode = 'P0002';
    end if;

    select coalesce(array_agg(source.source_round_id::text order by source.display_order)
             filter (where source.source_round_id is not null), array[]::text[])
      into v_round_ids
    from televoting.televote_aggregation_sources source
    where source.aggregation_id::text = v_source_id
      and source.enabled;

    if cardinality(v_round_ids) = 0 then
      raise exception 'Published Combined Televote has no bound source rounds'
        using errcode = '23514';
    end if;

    select binding.edition_id, binding.show_id
      into v_edition_id, v_show_id
    from public.televoting_round_bindings binding
    where binding.remote_round_id = v_round_ids[1];

    if v_show_id is null then
      raise exception 'Combined Televote source round is not bound to a Solaris show'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from unnest(v_round_ids) round_id
      where not exists (
        select 1
        from public.televoting_round_bindings binding
        where binding.remote_round_id = round_id
          and binding.edition_id = v_edition_id
          and binding.show_id = v_show_id
      )
    ) then
      raise exception 'Combined Televote sources do not resolve to one Solaris show'
        using errcode = '23514';
    end if;

    select count(*)::integer
      into v_source_rows
    from televoting.combined_televote_results source_result
    where source_result.aggregation_id::text = v_source_id
      and source_result.calculation_version = v_source_version;

    select
      count(*)::integer,
      count(distinct coalesce(participant.country_id, participant.contest_entity_id))::integer,
      coalesce(sum(source_result.final_combined_points), 0)::bigint,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'identityId', coalesce(participant.country_id, participant.contest_entity_id),
            'countryId', participant.country_id,
            'contestEntityId', participant.contest_entity_id,
            'points', source_result.final_combined_points::integer
          ) order by coalesce(participant.country_id, participant.contest_entity_id)
        ),
        '[]'::jsonb
      )
    into v_mapped_rows, v_distinct_rows, v_points_total, v_normalized
    from televoting.combined_televote_results source_result
    join public.countries country
      on upper(country.short_code) = upper(source_result.country_code)
    join public.participants participant
      on participant.show_id = v_show_id
     and participant.country_id = country.id
     and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
    where source_result.aggregation_id::text = v_source_id
      and source_result.calculation_version = v_source_version;
  end if;

  if v_event.entity_id is not null and v_event.entity_id <> v_show_id then
    raise exception 'Integration event show does not match canonical Televote binding'
      using errcode = '23514';
  end if;

  select count(*)::integer into v_participant_rows
  from public.participants participant
  where participant.show_id = v_show_id
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  if v_source_rows = 0
     or v_mapped_rows <> v_source_rows
     or v_distinct_rows <> v_source_rows
     or v_mapped_rows <> v_participant_rows
     or exists (
       select 1
       from jsonb_array_elements(v_normalized) row_value
       where (row_value ->> 'points')::integer < 0
     ) then
    raise exception 'Published Televote lineup/version does not exactly match active Solaris participants'
      using errcode = '23514';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(v_normalized::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('v3-televote-result:' || v_show_id::text, 0));

  select * into v_existing
  from private.v3_televote_result_imports imported
  where imported.source_type = v_source_type
    and imported.source_id = v_source_id
    and imported.source_version = v_source_version;

  select * into v_current
  from private.v3_televote_result_current current_import
  where current_import.show_id = v_show_id
  for update;

  if v_existing.id is not null then
    if v_existing.payload_hash is distinct from v_hash then
      raise exception 'Published Televote source version changed after import'
        using errcode = '23505';
    end if;

    perform public.sync_show_results_from_votes(v_show_id);
    return case
      when v_current.import_id = v_existing.id then 'replayed'
      else 'stale_replayed'
    end;
  end if;

  if v_current.import_id is not null then
    if v_current.source_type = v_source_type
       and v_current.source_id = v_source_id
       and v_source_version < v_current.source_version then
      perform public.sync_show_results_from_votes(v_show_id);
      return 'stale_version';
    end if;

    if v_current.source_type = 'combined'
       and (v_source_type <> 'combined' or v_current.source_id <> v_source_id) then
      perform public.sync_show_results_from_votes(v_show_id);
      return 'stale_source';
    end if;

    if v_current.source_type = 'round'
       and v_source_type = 'round'
       and v_current.source_id <> v_source_id then
      perform public.sync_show_results_from_votes(v_show_id);
      return 'conflicting_round_source';
    end if;

    if v_current.source_type = 'combined'
       and v_source_type = 'combined'
       and v_current.source_id <> v_source_id then
      perform public.sync_show_results_from_votes(v_show_id);
      return 'conflicting_combined_source';
    end if;
  end if;

  insert into private.v3_televote_result_imports (
    edition_id,
    show_id,
    source_type,
    source_id,
    source_version,
    payload_hash,
    row_count,
    points_total,
    source_event_id
  ) values (
    v_edition_id,
    v_show_id,
    v_source_type,
    v_source_id,
    v_source_version,
    v_hash,
    v_mapped_rows,
    v_points_total,
    p_event_id
  )
  returning id into v_import_id;

  insert into private.v3_televote_result_import_rows (
    import_id,
    identity_id,
    country_id,
    contest_entity_id,
    points
  )
  select
    v_import_id,
    (row_value ->> 'identityId')::uuid,
    nullif(row_value ->> 'countryId', '')::uuid,
    nullif(row_value ->> 'contestEntityId', '')::uuid,
    (row_value ->> 'points')::integer
  from jsonb_array_elements(v_normalized) row_value;

  insert into private.v3_televote_result_current (
    show_id,
    edition_id,
    import_id,
    source_type,
    source_id,
    source_version,
    payload_hash,
    updated_at
  ) values (
    v_show_id,
    v_edition_id,
    v_import_id,
    v_source_type,
    v_source_id,
    v_source_version,
    v_hash,
    now()
  )
  on conflict (show_id) do update
  set edition_id = excluded.edition_id,
      import_id = excluded.import_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      source_version = excluded.source_version,
      payload_hash = excluded.payload_hash,
      updated_at = now();

  update public.televoting_round_bindings binding
  set frozen_at = coalesce(binding.frozen_at, now()),
      updated_at = now()
  where binding.remote_round_id = any(v_round_ids)
    and binding.edition_id = v_edition_id
    and binding.show_id = v_show_id;

  perform public.sync_show_results_from_votes(v_show_id);

  return 'applied';
end
$reconcile$;

revoke all on function private.v3_reconcile_published_televote_result(uuid)
  from public, anon, authenticated;
grant execute on function private.v3_reconcile_published_televote_result(uuid)
  to service_role;

create or replace function private.v3_reconcile_televote_result_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
declare
  v_outcome text;
begin
  begin
    v_outcome := private.v3_reconcile_published_televote_result(new.id);

    if v_outcome in (
      'stale_replayed',
      'stale_version',
      'stale_source',
      'conflicting_round_source',
      'conflicting_combined_source'
    ) then
      update public.integration_events event
      set status = 'skipped',
          last_error = 'V3 Televote result authority ignored stale/conflicting source: ' || v_outcome,
          updated_at = now()
      where event.id = new.id;
    end if;
  exception when others then
    if new.entity_id is not null then
      begin
        perform public.sync_show_results_from_votes(new.entity_id);
      exception when others then
        null;
      end;
    end if;

    update public.integration_events event
    set status = 'failed',
        last_error = left('V3 Televote result authority: ' || sqlerrm, 1000),
        updated_at = now(),
        completed_at = null
    where event.id = new.id;
  end;

  return new;
end
$trigger$;

revoke all on function private.v3_reconcile_televote_result_event_trigger()
  from public, anon, authenticated;

drop trigger if exists v3_reconcile_televote_result_event
  on public.integration_events;
create trigger v3_reconcile_televote_result_event
after insert or update on public.integration_events
for each row
when (
  new.service = 'televoting'
  and new.status = 'completed'
  and new.event_type in ('round.results.imported', 'combined.results.imported')
)
execute function private.v3_reconcile_televote_result_event_trigger();

comment on table private.v3_televote_result_imports is
  'Immutable Solaris-side evidence for one exact published Televoting source/version.';
comment on table private.v3_televote_result_current is
  'Current Televote result source per Solaris show. Studio Results consumes this before legacy public.televote_votes.';
comment on function private.v3_reconcile_published_televote_result(uuid) is
  'Reconciles a completed Televoting result-import integration event to exact published source/version truth.';

notify pgrst, 'reload schema';

commit;
