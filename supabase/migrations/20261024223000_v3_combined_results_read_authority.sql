begin;

select public.v3_register_migration_contract(
  'v3.results.combined-read-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-edition observational Combined Results read authority on the current V3 schema.'
);

-- System V3 / #927, first vertical slice.
--
-- Combined Results needs an exact-edition, observational Organizer projection
-- before its legacy writers can be replaced safely. The Televoting aggregation
-- stores a remote Televoting edition id, while Organizer authority is scoped to
-- the canonical Solaris edition. Resolve that mapping through the canonical
-- integration link and never infer an edition from "current", newest, or list
-- ordering.

create or replace function private.v3_combined_remote_edition(
  p_edition_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $remote$
declare
  v_remote_id text;
  v_remote_uuid uuid;
begin
  if p_edition_id is null then
    raise exception 'Solaris edition is required' using errcode = '22023';
  end if;

  select link.remote_id
  into v_remote_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.solaris_id = p_edition_id
    and link.sync_status = 'linked';

  if v_remote_id is null then
    return null;
  end if;

  begin
    v_remote_uuid := v_remote_id::uuid;
  exception when invalid_text_representation then
    raise exception 'Linked Televoting edition identity is invalid'
      using errcode = '23514';
  end;

  return v_remote_uuid;
end
$remote$;

revoke all on function private.v3_combined_remote_edition(uuid)
  from public, anon, authenticated;

create or replace function private.v3_require_combined_results_read(
  p_edition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $authorize$
begin
  if p_edition_id is null then
    raise exception 'Solaris edition is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Solaris edition not found' using errcode = 'P0002';
  end if;

  if private.studio2_request_is_service_role() then
    return;
  end if;

  if auth.uid() is null
     or (
       not public.studio2_access_allowed('voting.read', p_edition_id, false)
       and not public.studio2_access_allowed('voting.manage', p_edition_id, false)
     ) then
    raise exception 'Missing Solaris capability: voting.read'
      using errcode = '42501';
  end if;
end
$authorize$;

revoke all on function private.v3_require_combined_results_read(uuid)
  from public, anon, authenticated;

create or replace function private.v3_combined_participant_binding_state(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $binding$
declare
  v_enabled_count integer := 0;
  v_manual_count integer := 0;
  v_bound_count integer := 0;
  v_scope_mismatch_count integer := 0;
  v_target_count integer := 0;
  v_show_text text;
  v_show_id uuid;
  v_active_count integer := 0;
  v_expected_codes text[] := '{}'::text[];
  v_actual_codes text[] := '{}'::text[];
begin
  select
    count(*) filter (where source.enabled)::integer,
    count(*) filter (
      where source.enabled and source.source_round_id is null
    )::integer,
    count(*) filter (
      where source.enabled
        and source.source_round_id is not null
        and binding.show_id is not null
        and binding.edition_id = p_edition_id
    )::integer,
    count(*) filter (
      where source.enabled
        and source.source_round_id is not null
        and (
          binding.remote_round_id is null
          or binding.show_id is null
          or binding.edition_id is distinct from p_edition_id
        )
    )::integer,
    count(distinct binding.show_id) filter (
      where source.enabled
        and source.source_round_id is not null
        and binding.show_id is not null
        and binding.edition_id = p_edition_id
    )::integer,
    min(binding.show_id::text) filter (
      where source.enabled
        and source.source_round_id is not null
        and binding.show_id is not null
        and binding.edition_id = p_edition_id
    )
  into
    v_enabled_count,
    v_manual_count,
    v_bound_count,
    v_scope_mismatch_count,
    v_target_count,
    v_show_text
  from televoting.televote_aggregation_sources source
  left join public.televoting_round_bindings binding
    on binding.remote_round_id = source.source_round_id::text
  where source.aggregation_id = p_aggregation_id;

  if v_enabled_count = 0 then
    return jsonb_build_object(
      'state', 'empty',
      'showId', null,
      'enabledSourceCount', 0,
      'expectedParticipantCount', null,
      'actualParticipantCount', (
        select count(*) from televoting.televote_aggregation_participants participant
        where participant.aggregation_id = p_aggregation_id
      )
    );
  end if;

  if v_manual_count > 0 then
    return jsonb_build_object(
      'state', 'custom',
      'showId', null,
      'enabledSourceCount', v_enabled_count,
      'manualSourceCount', v_manual_count,
      'expectedParticipantCount', null,
      'actualParticipantCount', (
        select count(*) from televoting.televote_aggregation_participants participant
        where participant.aggregation_id = p_aggregation_id
      )
    );
  end if;

  if v_scope_mismatch_count > 0
     or v_bound_count <> v_enabled_count
     or v_target_count <> 1
     or v_show_text is null then
    return jsonb_build_object(
      'state', 'ambiguous_source',
      'showId', null,
      'enabledSourceCount', v_enabled_count,
      'boundSourceCount', v_bound_count,
      'scopeMismatchCount', v_scope_mismatch_count,
      'expectedParticipantCount', null,
      'actualParticipantCount', (
        select count(*) from televoting.televote_aggregation_participants participant
        where participant.aggregation_id = p_aggregation_id
      )
    );
  end if;

  v_show_id := v_show_text::uuid;

  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = v_show_id
      and show_row.edition_id = p_edition_id
  ) then
    return jsonb_build_object(
      'state', 'ambiguous_source',
      'showId', v_show_id,
      'enabledSourceCount', v_enabled_count,
      'boundSourceCount', v_bound_count,
      'scopeMismatchCount', v_scope_mismatch_count + 1,
      'expectedParticipantCount', null,
      'actualParticipantCount', (
        select count(*) from televoting.televote_aggregation_participants participant
        where participant.aggregation_id = p_aggregation_id
      )
    );
  end if;

  select
    count(*)::integer,
    coalesce(
      array_agg(
        upper(btrim(country.short_code))
        order by participant.running_order nulls last, participant.id
      ) filter (where nullif(btrim(country.short_code), '') is not null),
      '{}'::text[]
    )
  into v_active_count, v_expected_codes
  from public.participants participant
  left join public.countries country on country.id = participant.country_id
  where participant.show_id = v_show_id
    and participant.country_id is not null
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  select coalesce(
    array_agg(
      upper(btrim(participant.country_code))
      order by participant.display_order, participant.country_code
    ),
    '{}'::text[]
  )
  into v_actual_codes
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = p_aggregation_id;

  if cardinality(v_expected_codes) <> v_active_count then
    return jsonb_build_object(
      'state', 'ambiguous_source',
      'showId', v_show_id,
      'enabledSourceCount', v_enabled_count,
      'expectedParticipantCount', v_active_count,
      'actualParticipantCount', cardinality(v_actual_codes),
      'reason', 'canonical_participant_missing_country_code'
    );
  end if;

  return jsonb_build_object(
    'state', case when v_expected_codes = v_actual_codes then 'up_to_date' else 'drift' end,
    'showId', v_show_id,
    'enabledSourceCount', v_enabled_count,
    'expectedParticipantCount', v_active_count,
    'actualParticipantCount', cardinality(v_actual_codes)
  );
end
$binding$;

revoke all on function private.v3_combined_participant_binding_state(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_combined_results_for_edition(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $list$
declare
  v_remote_edition_id uuid;
  v_items jsonb := '[]'::jsonb;
begin
  perform private.v3_require_combined_results_read(p_edition_id);
  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);

  if v_remote_edition_id is null then
    return jsonb_build_object(
      'editionId', p_edition_id,
      'remoteEditionId', null,
      'linkState', 'unlinked',
      'serverTime', now(),
      'items', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', aggregation.id,
        'editionId', p_edition_id,
        'remoteEditionId', aggregation.edition_id,
        'name', aggregation.name,
        'status', aggregation.status,
        'calculationVersion', aggregation.calculation_version,
        'configVersion', null,
        'stateVersion', null,
        'calculatedAt', aggregation.calculated_at,
        'lockedAt', aggregation.locked_at,
        'publishedAt', aggregation.published_at,
        'resultsOutdated', aggregation.results_outdated,
        'participantBinding', binding.snapshot,
        'sourceSummary', jsonb_build_object(
          'sourceCount', source_evidence.source_count,
          'enabledSourceCount', source_evidence.enabled_count,
          'manualSourceCount', source_evidence.manual_count,
          'exactEditionBoundSourceCount', source_evidence.exact_bound_count,
          'scopeMismatchCount', source_evidence.scope_mismatch_count,
          'showIds', source_evidence.show_ids
        ),
        'solarisProjection', case
          when projection.show_id is null then null
          else jsonb_build_object(
            'showId', projection.show_id,
            'sourceVersion', projection.source_version,
            'projectionRevision', projection.projection_revision,
            'rowCount', projection.row_count,
            'pointsTotal', projection.points_total,
            'syncedAt', projection.synced_at
          )
        end,
        'reconciliationState', case
          when aggregation.status <> 'published' then 'not_published'
          when (binding.snapshot ->> 'state') = 'drift' then 'participant_drift'
          when (binding.snapshot ->> 'state') not in ('up_to_date', 'drift') then 'unbound_or_custom'
          when projection.show_id is null then 'missing_projection'
          when projection.edition_id is distinct from p_edition_id then 'wrong_edition_projection'
          when projection.source_version is distinct from aggregation.calculation_version then 'stale_projection'
          else 'in_sync'
        end
      )
      order by aggregation.created_at desc, aggregation.id
    ),
    '[]'::jsonb
  )
  into v_items
  from televoting.televote_aggregations aggregation
  cross join lateral (
    select private.v3_combined_participant_binding_state(
      p_edition_id,
      aggregation.id
    ) as snapshot
  ) binding
  cross join lateral (
    select
      count(*)::integer as source_count,
      count(*) filter (where source.enabled)::integer as enabled_count,
      count(*) filter (
        where source.enabled and source.source_round_id is null
      )::integer as manual_count,
      count(*) filter (
        where source.enabled
          and source.source_round_id is not null
          and round_binding.show_id is not null
          and round_binding.edition_id = p_edition_id
      )::integer as exact_bound_count,
      count(*) filter (
        where source.enabled
          and source.source_round_id is not null
          and (
            round_binding.remote_round_id is null
            or round_binding.show_id is null
            or round_binding.edition_id is distinct from p_edition_id
          )
      )::integer as scope_mismatch_count,
      coalesce(
        jsonb_agg(distinct round_binding.show_id)
          filter (
            where source.enabled
              and round_binding.show_id is not null
              and round_binding.edition_id = p_edition_id
          ),
        '[]'::jsonb
      ) as show_ids
    from televoting.televote_aggregation_sources source
    left join public.televoting_round_bindings round_binding
      on round_binding.remote_round_id = source.source_round_id::text
    where source.aggregation_id = aggregation.id
  ) source_evidence
  left join private.v3_televote_result_projection_sources projection
    on projection.source_type = 'combined'
   and projection.source_id = aggregation.id::text
  where aggregation.edition_id = v_remote_edition_id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'remoteEditionId', v_remote_edition_id,
    'linkState', 'linked',
    'serverTime', now(),
    'items', v_items
  );
end
$list$;

revoke all on function public.v3_combined_results_for_edition(uuid)
  from public, anon;
grant execute on function public.v3_combined_results_for_edition(uuid)
  to authenticated, service_role;

create or replace function public.v3_combined_result_detail(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $detail$
declare
  v_list jsonb;
  v_summary jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_participants jsonb := '[]'::jsonb;
  v_result_count integer := 0;
  v_result_points bigint := 0;
begin
  if p_aggregation_id is null then
    raise exception 'Combined aggregation is required' using errcode = '22023';
  end if;

  v_list := public.v3_combined_results_for_edition(p_edition_id);

  select item
  into v_summary
  from jsonb_array_elements(coalesce(v_list -> 'items', '[]'::jsonb)) item
  where item ->> 'id' = p_aggregation_id::text;

  if v_summary is null then
    if exists (
      select 1 from televoting.televote_aggregations aggregation
      where aggregation.id = p_aggregation_id
    ) then
      raise exception 'Combined result is outside the reviewed Organizer edition'
        using errcode = '42501';
    end if;
    raise exception 'Combined result not found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source.id,
        'sourceType', source.source_type,
        'inputMode', source.input_mode,
        'roundId', source.source_round_id,
        'name', source.source_name,
        'enabled', source.enabled,
        'displayOrder', source.display_order,
        'weight', source.weight,
        'percentageWeight', source.percentage_weight,
        'sourceRemoteEditionId', round_row.edition_id,
        'sourceSolarisEditionId', round_binding.edition_id,
        'sourceShowId', round_binding.show_id,
        'scopeState', case
          when source.source_round_id is null then 'manual'
          when round_binding.remote_round_id is null or round_binding.show_id is null then 'unbound'
          when round_binding.edition_id is distinct from p_edition_id then 'wrong_edition'
          else 'exact_edition'
        end
      )
      order by source.display_order, source.id
    ),
    '[]'::jsonb
  )
  into v_sources
  from televoting.televote_aggregation_sources source
  left join televoting.rounds round_row on round_row.id = source.source_round_id
  left join public.televoting_round_bindings round_binding
    on round_binding.remote_round_id = source.source_round_id::text
  where source.aggregation_id = p_aggregation_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'countryCode', upper(btrim(participant.country_code)),
        'displayOrder', participant.display_order
      )
      order by participant.display_order, participant.country_code
    ),
    '[]'::jsonb
  )
  into v_participants
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = p_aggregation_id;

  select
    count(*)::integer,
    coalesce(sum(result.final_combined_points), 0)::bigint
  into v_result_count, v_result_points
  from televoting.combined_televote_results result
  where result.aggregation_id = p_aggregation_id
    and result.calculation_version = coalesce((v_summary ->> 'calculationVersion')::integer, 0);

  return v_summary || jsonb_build_object(
    'serverTime', now(),
    'sources', v_sources,
    'participantSnapshot', v_participants,
    'currentResult', jsonb_build_object(
      'calculationVersion', (v_summary ->> 'calculationVersion')::integer,
      'rowCount', v_result_count,
      'pointsTotal', v_result_points
    ),
    'expectedVersions', jsonb_build_object(
      'calculationVersion', (v_summary ->> 'calculationVersion')::integer,
      'configVersion', null,
      'stateVersion', null
    ),
    'missingVersionContracts', jsonb_build_array('configVersion', 'stateVersion')
  );
end
$detail$;

revoke all on function public.v3_combined_result_detail(uuid, uuid)
  from public, anon;
grant execute on function public.v3_combined_result_detail(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;