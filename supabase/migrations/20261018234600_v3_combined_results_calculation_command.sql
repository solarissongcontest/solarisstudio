begin;

-- System V3 / #927: governed Combined Results calculation.
--
-- Calculation remains in the existing trusted TypeScript engine. The database
-- owns authorization, operation identity, exact-edition scope, input snapshot
-- identity, CAS and the atomic result commit. Browser clients can begin a
-- calculation but cannot submit calculated rows. Only the service-role server
-- may read the bound calculation snapshot and commit/fail the claimed operation.

create table if not exists private.v3_combined_calculation_claims (
  operation_id uuid primary key
    references public.studio2_operation_receipts(operation_id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  aggregation_id uuid not null
    references televoting.televote_aggregations(id) on delete cascade,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  snapshot_bytes integer not null check (snapshot_bytes between 1 and 2097152),
  participant_count integer not null check (participant_count between 1 and 500),
  source_count integer not null check (source_count between 1 and 100),
  created_at timestamptz not null default now()
);

alter table private.v3_combined_calculation_claims enable row level security;
revoke all on table private.v3_combined_calculation_claims
  from public, anon, authenticated;

create or replace function private.v3_combined_calculation_snapshot(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $snapshot$
declare
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_participant_count integer := 0;
  v_source_count integer := 0;
  v_manual_row_count integer := 0;
  v_raw_entry_count integer := 0;
  v_round_result_count integer := 0;
  v_participants jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_bytes integer;
  v_fingerprint text;
begin
  if p_edition_id is null or p_aggregation_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);
  if v_remote_edition_id is null then
    raise exception 'Solaris edition is not linked to Televoting'
      using errcode = 'P0002';
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  if v_aggregation.id is null then
    raise exception 'Combined result not found' using errcode = 'P0002';
  end if;
  if v_aggregation.edition_id is distinct from v_remote_edition_id then
    raise exception 'Combined result is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             upper(btrim(participant.country_code))
             order by participant.display_order, participant.country_code
           ),
           '[]'::jsonb
         )
  into v_participant_count, v_participants
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = p_aggregation_id;

  select count(*)::integer
  into v_source_count
  from televoting.televote_aggregation_sources source
  where source.aggregation_id = p_aggregation_id;

  if v_participant_count not between 1 and 500
     or v_source_count not between 1 and 100 then
    raise exception using errcode = '54000', message = 'RESOURCE_LIMIT';
  end if;

  if exists (
    select 1
    from televoting.televote_aggregation_sources source
    left join televoting.rounds round_row
      on round_row.id = source.source_round_id
    left join public.televoting_round_bindings binding
      on binding.remote_round_id = source.source_round_id::text
    where source.aggregation_id = p_aggregation_id
      and source.enabled
      and source.source_round_id is not null
      and (
        round_row.id is null
        or round_row.edition_id is distinct from v_remote_edition_id
        or binding.remote_round_id is null
        or binding.edition_id is distinct from p_edition_id
        or binding.show_id is null
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = 'Enabled round sources must resolve to the reviewed Solaris edition.';
  end if;

  select count(*)::integer
  into v_manual_row_count
  from televoting.external_score_entries entry
  join televoting.televote_aggregation_sources source on source.id = entry.source_id
  where source.aggregation_id = p_aggregation_id;

  select count(*)::integer
  into v_raw_entry_count
  from televoting.televote_aggregation_sources source
  join televoting.vote_submissions submission
    on submission.round_id = source.source_round_id
   and submission.status <> 'deleted'
  join televoting.vote_entries vote_entry
    on vote_entry.submission_id = submission.id
  where source.aggregation_id = p_aggregation_id
    and source.enabled
    and source.source_round_id is not null
    and coalesce(source.input_mode, 'raw_results') <> 'converted_points';

  select count(*)::integer
  into v_round_result_count
  from televoting.televote_aggregation_sources source
  join televoting.rounds round_row on round_row.id = source.source_round_id
  join televoting.round_results result_row
    on result_row.round_id = round_row.id
   and result_row.calculation_version = round_row.calculation_version
  where source.aggregation_id = p_aggregation_id
    and source.enabled
    and source.source_round_id is not null
    and source.input_mode = 'converted_points';

  if v_manual_row_count > 50000
     or v_raw_entry_count > 100000
     or v_round_result_count > 50000 then
    raise exception using errcode = '54000', message = 'RESOURCE_LIMIT';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source.id,
        'name', source.source_name,
        'type', source.source_type,
        'inputMode', source.input_mode,
        'percentageWeight', source.percentage_weight,
        'enabled', source.enabled,
        'displayOrder', source.display_order,
        'correctionTargetSourceId', source.correction_target_source_id,
        'correctionScope', source.correction_scope,
        'sourceRoundId', source.source_round_id,
        'sourceRoundCalculationVersion', round_row.calculation_version,
        'sourceRoundResultsOutdated', round_row.results_outdated,
        'values', case
          when source.source_round_id is null then coalesce((
            select jsonb_object_agg(value_row.country_code, value_row.total order by value_row.country_code)
            from (
              select
                upper(btrim(entry.country_code)) as country_code,
                sum(entry.value)::numeric as total
              from televoting.external_score_entries entry
              where entry.source_id = source.id
              group by upper(btrim(entry.country_code))
            ) value_row
          ), '{}'::jsonb)
          when source.input_mode = 'converted_points' then coalesce((
            select jsonb_object_agg(value_row.country_code, value_row.points order by value_row.country_code)
            from (
              select
                upper(btrim(result_row.country_code)) as country_code,
                result_row.final_points::numeric as points
              from televoting.round_results result_row
              where result_row.round_id = source.source_round_id
                and result_row.calculation_version = round_row.calculation_version
            ) value_row
          ), '{}'::jsonb)
          else coalesce((
            select jsonb_object_agg(value_row.country_code, value_row.points order by value_row.country_code)
            from (
              select
                upper(btrim(vote_entry.target_country_code)) as country_code,
                sum(vote_entry.points)::numeric as points
              from televoting.vote_submissions submission
              join televoting.vote_entries vote_entry
                on vote_entry.submission_id = submission.id
              where submission.round_id = source.source_round_id
                and submission.status <> 'deleted'
              group by upper(btrim(vote_entry.target_country_code))
            ) value_row
          ), '{}'::jsonb)
        end,
        'distributions', case
          when source.source_round_id is not null
           and source.input_mode <> 'converted_points' then coalesce((
            select jsonb_object_agg(
              distribution_row.country_code,
              distribution_row.scores
              order by distribution_row.country_code
            )
            from (
              select
                upper(btrim(vote_entry.target_country_code)) as country_code,
                jsonb_agg(vote_entry.points order by vote_entry.points desc, vote_entry.id) as scores
              from televoting.vote_submissions submission
              join televoting.vote_entries vote_entry
                on vote_entry.submission_id = submission.id
              where submission.round_id = source.source_round_id
                and submission.status <> 'deleted'
              group by upper(btrim(vote_entry.target_country_code))
            ) distribution_row
          ), '{}'::jsonb)
          else null
        end
      )
      order by source.display_order, source.id
    ),
    '[]'::jsonb
  )
  into v_sources
  from televoting.televote_aggregation_sources source
  left join televoting.rounds round_row on round_row.id = source.source_round_id
  where source.aggregation_id = p_aggregation_id;

  v_snapshot := jsonb_build_object(
    'aggregation', jsonb_build_object(
      'id', v_aggregation.id,
      'editionId', p_edition_id,
      'remoteEditionId', v_aggregation.edition_id,
      'name', v_aggregation.name,
      'totalPoints', v_aggregation.total_points_to_distribute,
      'rankExponent', v_aggregation.rank_exponent,
      'configVersion', v_aggregation.config_version,
      'stateVersion', v_aggregation.state_version,
      'calculationVersion', v_aggregation.calculation_version,
      'status', v_aggregation.status,
      'resultsOutdated', v_aggregation.results_outdated
    ),
    'participants', v_participants,
    'sources', v_sources
  );

  v_bytes := pg_column_size(v_snapshot);
  if v_bytes > 2097152 then
    raise exception using errcode = '54000', message = 'RESOURCE_LIMIT';
  end if;

  v_fingerprint := encode(
    extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'fingerprint', v_fingerprint,
    'bytes', v_bytes,
    'participantCount', v_participant_count,
    'sourceCount', v_source_count,
    'snapshot', v_snapshot
  );
end
$snapshot$;

revoke all on function private.v3_combined_calculation_snapshot(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_fail_combined_calculation_receipt(
  p_operation_id uuid,
  p_error_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fail_receipt$
declare
  v_code text := upper(btrim(coalesce(p_error_code, 'UNKNOWN')));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_code not in (
    'VALIDATION',
    'STATE_CHANGED',
    'VERSION_CONFLICT',
    'DEPENDENCY_FAILURE',
    'DATABASE',
    'UNKNOWN'
  ) then
    v_code := 'UNKNOWN';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' or pg_column_size(v_metadata) > 8192 then
    v_metadata := jsonb_build_object('detail', 'bounded_error_metadata_rejected');
  end if;

  update public.studio2_operation_receipts receipt
  set
    status = 'failed',
    completed_at = now(),
    updated_at = now(),
    error_code = v_code,
    error_metadata = v_metadata,
    result = null
  where receipt.operation_id = p_operation_id
    and receipt.command = 'results.calculate'
    and receipt.status = 'processing';

  return jsonb_build_object(
    'ok', false,
    'operationId', p_operation_id,
    'error', jsonb_build_object('code', v_code, 'metadata', v_metadata)
  );
end
$fail_receipt$;

revoke all on function private.v3_fail_combined_calculation_receipt(uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function public.v3_begin_combined_result_calculation(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_expected_config_version bigint,
  p_expected_state_version bigint,
  p_expected_calculation_version integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $begin_calculation$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if p_edition_id is null
     or p_aggregation_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_config_version is null
     or p_expected_state_version is null
     or p_expected_calculation_version is null
     or p_expected_config_version < 0
     or p_expected_state_version < 0
     or p_expected_calculation_version < 0
     or (v_reason is not null and length(v_reason) > 1000) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);
  if v_remote_edition_id is null then
    raise exception 'Solaris edition is not linked to Televoting'
      using errcode = 'P0002';
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  if v_aggregation.id is null then
    raise exception 'Combined result not found' using errcode = 'P0002';
  end if;
  if v_aggregation.edition_id is distinct from v_remote_edition_id then
    raise exception 'Combined result is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.calculate',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result',
      'expectedConfigVersion', p_expected_config_version,
      'expectedStateVersion', p_expected_state_version,
      'expectedCalculationVersion', p_expected_calculation_version
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'expectedConfigVersion', p_expected_config_version,
      'expectedStateVersion', p_expected_state_version,
      'expectedCalculationVersion', p_expected_calculation_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return jsonb_build_object(
      'ok', v_receipt.status in ('processing', 'succeeded'),
      'replayed', true,
      'operationId', v_operation_id,
      'status', v_receipt.status,
      'result', v_receipt.result,
      'error', case when v_receipt.error_code is null then null else jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      ) end
    );
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);
  if v_remote_edition_id is null
     or v_aggregation.edition_id is distinct from v_remote_edition_id then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  if v_aggregation.config_version is distinct from p_expected_config_version
     or v_aggregation.state_version is distinct from p_expected_state_version
     or v_aggregation.calculation_version is distinct from p_expected_calculation_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_preflight := public.v3_combined_result_preflight(
    p_edition_id,
    p_aggregation_id,
    'recalculate'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'status', 'processing',
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'expectedVersions', jsonb_build_object(
      'configVersion', p_expected_config_version,
      'stateVersion', p_expected_state_version,
      'calculationVersion', p_expected_calculation_version
    ),
    'nextCalculationVersion', p_expected_calculation_version + 1,
    'serverTime', now()
  );
end
$begin_calculation$;

revoke all on function public.v3_begin_combined_result_calculation(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_begin_combined_result_calculation(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) to authenticated;

create or replace function public.v3_combined_result_calculation_snapshot_service(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $service_snapshot$
declare
  v_receipt public.studio2_operation_receipts%rowtype;
  v_snapshot jsonb;
  v_claim private.v3_combined_calculation_claims%rowtype;
  v_edition_id uuid;
  v_aggregation_id uuid;
  v_expected_config bigint;
  v_expected_state bigint;
  v_expected_calculation integer;
  v_aggregation televoting.televote_aggregations%rowtype;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.command <> 'results.calculate'
     or v_receipt.risk_class <> 'R2' then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_receipt.status <> 'processing' then
    return jsonb_build_object(
      'ok', v_receipt.status = 'succeeded',
      'status', v_receipt.status,
      'result', v_receipt.result,
      'error', case when v_receipt.error_code is null then null else jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      ) end
    );
  end if;

  v_edition_id := nullif(v_receipt.scope ->> 'editionId', '')::uuid;
  v_aggregation_id := nullif(v_receipt.scope ->> 'aggregationId', '')::uuid;
  v_expected_config := nullif(v_receipt.scope ->> 'expectedConfigVersion', '')::bigint;
  v_expected_state := nullif(v_receipt.scope ->> 'expectedStateVersion', '')::bigint;
  v_expected_calculation := nullif(v_receipt.scope ->> 'expectedCalculationVersion', '')::integer;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = v_aggregation_id;

  if v_aggregation.id is null
     or v_aggregation.config_version is distinct from v_expected_config
     or v_aggregation.state_version is distinct from v_expected_state
     or v_aggregation.calculation_version is distinct from v_expected_calculation then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VERSION_CONFLICT',
      jsonb_build_object('stage', 'snapshot')
    );
  end if;

  begin
    v_snapshot := private.v3_combined_calculation_snapshot(
      v_edition_id,
      v_aggregation_id
    );
  exception when others then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      case when sqlstate = '54000' then 'VALIDATION' else 'STATE_CHANGED' end,
      jsonb_build_object('stage', 'snapshot', 'databaseCode', sqlstate)
    );
  end;

  insert into private.v3_combined_calculation_claims (
    operation_id,
    edition_id,
    aggregation_id,
    input_fingerprint,
    snapshot_bytes,
    participant_count,
    source_count
  ) values (
    p_operation_id,
    v_edition_id,
    v_aggregation_id,
    v_snapshot ->> 'fingerprint',
    (v_snapshot ->> 'bytes')::integer,
    (v_snapshot ->> 'participantCount')::integer,
    (v_snapshot ->> 'sourceCount')::integer
  )
  on conflict (operation_id) do nothing;

  select claim.*
  into v_claim
  from private.v3_combined_calculation_claims claim
  where claim.operation_id = p_operation_id;

  if v_claim.edition_id is distinct from v_edition_id
     or v_claim.aggregation_id is distinct from v_aggregation_id
     or v_claim.input_fingerprint is distinct from (v_snapshot ->> 'fingerprint') then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'STATE_CHANGED',
      jsonb_build_object('stage', 'snapshot', 'reason', 'input_snapshot_changed')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'processing',
    'operationId', p_operation_id,
    'inputFingerprint', v_claim.input_fingerprint,
    'snapshot', v_snapshot -> 'snapshot'
  );
end
$service_snapshot$;

revoke all on function public.v3_combined_result_calculation_snapshot_service(uuid)
  from public, anon, authenticated;
grant execute on function public.v3_combined_result_calculation_snapshot_service(uuid)
  to service_role;

create or replace function public.v3_fail_combined_result_calculation_service(
  p_operation_id uuid,
  p_error_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $service_fail$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.v3_fail_combined_calculation_receipt(
    p_operation_id,
    p_error_code,
    p_metadata
  );
end
$service_fail$;

revoke all on function public.v3_fail_combined_result_calculation_service(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.v3_fail_combined_result_calculation_service(uuid, text, jsonb)
  to service_role;

create or replace function public.v3_commit_combined_result_calculation_service(
  p_operation_id uuid,
  p_input_fingerprint text,
  p_engine_version text,
  p_pools jsonb,
  p_component_rows jsonb,
  p_final_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $commit_calculation$
declare
  v_receipt public.studio2_operation_receipts%rowtype;
  v_claim private.v3_combined_calculation_claims%rowtype;
  v_edition_id uuid;
  v_aggregation_id uuid;
  v_expected_config bigint;
  v_expected_state bigint;
  v_expected_calculation integer;
  v_next_calculation integer;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_snapshot jsonb;
  v_participant_count integer := 0;
  v_component_source_count integer := 0;
  v_pool_count integer := 0;
  v_component_count integer := 0;
  v_final_count integer := 0;
  v_next_config bigint;
  v_next_state bigint;
  v_next_status text;
  v_calculated_at timestamptz := now();
  v_result jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_operation_id is null
     or coalesce(p_input_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or p_engine_version is distinct from 'component-pool-v2'
     or jsonb_typeof(coalesce(p_pools, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_component_rows, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_final_rows, 'null'::jsonb)) <> 'array'
     or pg_column_size(p_pools) > 262144
     or pg_column_size(p_component_rows) > 4194304
     or pg_column_size(p_final_rows) > 1048576 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.command <> 'results.calculate'
     or v_receipt.risk_class <> 'R2' then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;
  if v_receipt.status <> 'processing' then
    return jsonb_build_object(
      'ok', false,
      'operationId', p_operation_id,
      'error', jsonb_build_object(
        'code', coalesce(v_receipt.error_code, 'STATE_CHANGED'),
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      )
    );
  end if;

  select claim.*
  into v_claim
  from private.v3_combined_calculation_claims claim
  where claim.operation_id = p_operation_id;

  if v_claim.operation_id is null
     or v_claim.input_fingerprint is distinct from p_input_fingerprint then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'STATE_CHANGED',
      jsonb_build_object('stage', 'commit', 'reason', 'snapshot_claim_mismatch')
    );
  end if;

  v_edition_id := v_claim.edition_id;
  v_aggregation_id := v_claim.aggregation_id;
  v_expected_config := nullif(v_receipt.scope ->> 'expectedConfigVersion', '')::bigint;
  v_expected_state := nullif(v_receipt.scope ->> 'expectedStateVersion', '')::bigint;
  v_expected_calculation := nullif(v_receipt.scope ->> 'expectedCalculationVersion', '')::integer;
  v_next_calculation := v_expected_calculation + 1;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = v_aggregation_id
  for update;

  if v_aggregation.id is null
     or v_aggregation.config_version is distinct from v_expected_config
     or v_aggregation.state_version is distinct from v_expected_state
     or v_aggregation.calculation_version is distinct from v_expected_calculation
     or v_aggregation.status in ('locked', 'published') then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VERSION_CONFLICT',
      jsonb_build_object('stage', 'commit')
    );
  end if;

  begin
    v_snapshot := private.v3_combined_calculation_snapshot(
      v_edition_id,
      v_aggregation_id
    );
  exception when others then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'STATE_CHANGED',
      jsonb_build_object('stage', 'commit_snapshot', 'databaseCode', sqlstate)
    );
  end;

  if (v_snapshot ->> 'fingerprint') is distinct from v_claim.input_fingerprint then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'STATE_CHANGED',
      jsonb_build_object('stage', 'commit', 'reason', 'input_snapshot_changed')
    );
  end if;

  select count(*)::integer
  into v_participant_count
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = v_aggregation_id;

  select count(*)::integer
  into v_component_source_count
  from televoting.televote_aggregation_sources source
  where source.aggregation_id = v_aggregation_id
    and source.enabled
    and source.input_mode <> 'correction';

  v_pool_count := jsonb_array_length(p_pools);
  v_component_count := jsonb_array_length(p_component_rows);
  v_final_count := jsonb_array_length(p_final_rows);

  if v_pool_count <> v_component_source_count
     or v_final_count <> v_participant_count
     or v_component_count <> v_component_source_count * v_participant_count
     or v_pool_count > 100
     or v_final_count not between 1 and 500
     or v_component_count > 50000 then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VALIDATION',
      jsonb_build_object('stage', 'payload_shape')
    );
  end if;

  if (
    select count(distinct nullif(pool ->> 'sourceId', '')::uuid)
    from jsonb_array_elements(p_pools) pool
  ) <> v_component_source_count
  or exists (
    select 1
    from jsonb_array_elements(p_pools) pool
    where not exists (
      select 1
      from televoting.televote_aggregation_sources source
      where source.aggregation_id = v_aggregation_id
        and source.id = nullif(pool ->> 'sourceId', '')::uuid
        and source.enabled
        and source.input_mode <> 'correction'
    )
  ) then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VALIDATION',
      jsonb_build_object('stage', 'pool_scope')
    );
  end if;

  if (
    select count(distinct upper(btrim(row_data ->> 'countryCode')))
    from jsonb_array_elements(p_final_rows) row_data
  ) <> v_participant_count
  or exists (
    select 1
    from jsonb_array_elements(p_final_rows) row_data
    where not exists (
      select 1
      from televoting.televote_aggregation_participants participant
      where participant.aggregation_id = v_aggregation_id
        and upper(btrim(participant.country_code)) = upper(btrim(row_data ->> 'countryCode'))
    )
  ) then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VALIDATION',
      jsonb_build_object('stage', 'final_result_scope')
    );
  end if;

  if (
    select count(distinct (
      nullif(row_data ->> 'sourceId', '')::uuid,
      upper(btrim(row_data ->> 'countryCode'))
    ))
    from jsonb_array_elements(p_component_rows) row_data
  ) <> v_component_count
  or exists (
    select 1
    from jsonb_array_elements(p_component_rows) row_data
    where not exists (
      select 1
      from televoting.televote_aggregation_sources source
      where source.aggregation_id = v_aggregation_id
        and source.id = nullif(row_data ->> 'sourceId', '')::uuid
        and source.enabled
        and source.input_mode <> 'correction'
    )
    or not exists (
      select 1
      from televoting.televote_aggregation_participants participant
      where participant.aggregation_id = v_aggregation_id
        and upper(btrim(participant.country_code)) = upper(btrim(row_data ->> 'countryCode'))
    )
  ) then
    return private.v3_fail_combined_calculation_receipt(
      p_operation_id,
      'VALIDATION',
      jsonb_build_object('stage', 'component_result_scope')
    );
  end if;

  perform set_config('solaris.v3_combined_config_batch', '1', true);

  update televoting.televote_aggregation_sources source
  set
    calculation_method = pool.method,
    exact_point_pool = pool.exact_pool,
    floored_point_pool = pool.floored_pool,
    pool_remainder = pool.pool_remainder,
    pool_remainder_bonus = pool.pool_bonus,
    final_point_pool = pool.final_pool
  from jsonb_to_recordset(p_pools) as pool(
    source_id uuid,
    method text,
    exact_pool numeric,
    floored_pool integer,
    pool_remainder numeric,
    pool_bonus integer,
    final_pool integer
  )
  where source.aggregation_id = v_aggregation_id
    and source.id = pool.source_id;

  -- jsonb_to_recordset uses exact SQL column names; normalize the trusted
  -- server's camelCase envelope once before relational insertion.
  delete from televoting.combined_televote_component_results component
  where component.aggregation_id = v_aggregation_id
    and component.calculation_version = v_next_calculation;
  delete from televoting.combined_televote_results result_row
  where result_row.aggregation_id = v_aggregation_id
    and result_row.calculation_version = v_next_calculation;

  insert into televoting.combined_televote_component_results (
    aggregation_id,
    component_id,
    component_name,
    component_type,
    country_code,
    calculation_version,
    method,
    percentage_weight,
    component_pool,
    raw_score,
    raw_rank,
    participant_count,
    rank_base,
    rank_exponent,
    rank_factor,
    weighted_score,
    source_weighted_total,
    exact_allocation,
    floored_allocation,
    decimal_remainder,
    remainder_bonus,
    final_allocated_points,
    tie_break_data,
    calculated_at
  )
  select
    v_aggregation_id,
    nullif(row_data ->> 'sourceId', '')::uuid,
    coalesce(row_data ->> 'sourceName', ''),
    coalesce(row_data ->> 'sourceType', 'round'),
    upper(btrim(row_data ->> 'countryCode')),
    v_next_calculation,
    coalesce(row_data ->> 'method', 'rank_weighted'),
    coalesce((row_data ->> 'percentageWeight')::numeric, 0),
    coalesce((row_data ->> 'componentPool')::integer, 0),
    coalesce((row_data ->> 'rawScore')::numeric, 0),
    nullif(row_data ->> 'rawRank', '')::integer,
    coalesce((row_data ->> 'participantCount')::integer, v_participant_count),
    nullif(row_data ->> 'rankBase', '')::integer,
    nullif(row_data ->> 'rankExponent', '')::numeric,
    nullif(row_data ->> 'rankFactor', '')::numeric,
    nullif(row_data ->> 'weightedScore', '')::numeric,
    nullif(row_data ->> 'sourceWeightedTotal', '')::numeric,
    coalesce((row_data ->> 'exactAllocation')::numeric, 0),
    coalesce((row_data ->> 'flooredAllocation')::integer, 0),
    coalesce((row_data ->> 'decimalRemainder')::numeric, 0),
    coalesce((row_data ->> 'remainderBonus')::integer, 0),
    coalesce((row_data ->> 'finalAllocatedPoints')::integer, 0),
    coalesce(row_data -> 'tieBreakData', '{}'::jsonb),
    v_calculated_at
  from jsonb_array_elements(p_component_rows) row_data;

  insert into televoting.combined_televote_results (
    aggregation_id,
    country_code,
    source_contributions,
    combined_original_rank,
    participant_count,
    converted_points,
    post_conversion_bonus,
    post_conversion_adjustment,
    final_televote_score,
    calculation_version,
    calculated_at,
    total_voting_points,
    total_activity_points,
    final_combined_points,
    final_correction,
    final_rank,
    final_tie_break_data
  )
  select
    v_aggregation_id,
    upper(btrim(row_data ->> 'countryCode')),
    coalesce(row_data -> 'sourceContributions', '[]'::jsonb),
    coalesce((row_data ->> 'combinedOriginalRank')::integer, 0),
    coalesce((row_data ->> 'participantCount')::integer, v_participant_count),
    coalesce((row_data ->> 'convertedPoints')::integer, 0),
    coalesce((row_data ->> 'postConversionBonus')::numeric, 0),
    coalesce((row_data ->> 'postConversionAdjustment')::numeric, 0),
    coalesce((row_data ->> 'finalTelevoteScore')::numeric, 0),
    v_next_calculation,
    v_calculated_at,
    coalesce((row_data ->> 'totalVotingPoints')::numeric, 0),
    coalesce((row_data ->> 'totalActivityPoints')::numeric, 0),
    coalesce((row_data ->> 'finalCombinedPoints')::numeric, 0),
    coalesce((row_data ->> 'finalCorrection')::numeric, 0),
    coalesce((row_data ->> 'finalRank')::integer, 0),
    coalesce(row_data -> 'finalTieBreakData', '{}'::jsonb)
  from jsonb_array_elements(p_final_rows) row_data;

  perform set_config('solaris.v3_combined_config_batch', '0', true);

  update televoting.televote_aggregations aggregation
  set
    status = case when aggregation.status = 'draft' then 'calculated' else aggregation.status end,
    calculation_version = v_next_calculation,
    calculated_at = v_calculated_at,
    calculated_by = v_receipt.actor_id,
    calculated_by_username = coalesce(
      (select user_row.email from auth.users user_row where user_row.id = v_receipt.actor_id),
      v_receipt.actor_id::text
    ),
    results_outdated = false
  where aggregation.id = v_aggregation_id;

  select
    aggregation.config_version,
    aggregation.state_version,
    aggregation.status
  into v_next_config, v_next_state, v_next_status
  from televoting.televote_aggregations aggregation
  where aggregation.id = v_aggregation_id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    new_values
  ) values (
    v_receipt.actor_id,
    coalesce(
      (select user_row.email from auth.users user_row where user_row.id = v_receipt.actor_id),
      v_receipt.actor_id::text
    ),
    'calculate_combined_televote',
    'televote_aggregation',
    v_aggregation_id::text,
    jsonb_build_object(
      'engine', p_engine_version,
      'inputFingerprint', v_claim.input_fingerprint,
      'participantCount', v_participant_count,
      'sourceCount', v_claim.source_count,
      'componentResultCount', v_component_count,
      'finalResultCount', v_final_count,
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    )
  );

  perform private.v3_emit_domain_event(
    'results.calculated',
    'combined_result',
    v_aggregation_id::text,
    v_next_calculation,
    p_operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'aggregationId', v_aggregation_id,
      'resultKind', 'combined_televote',
      'engineVersion', p_engine_version,
      'participantCount', v_participant_count,
      'sourceCount', v_claim.source_count,
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'riskClass', 'R2',
    'editionId', v_edition_id,
    'aggregationId', v_aggregation_id,
    'operationId', p_operation_id,
    'engineVersion', p_engine_version,
    'inputFingerprint', v_claim.input_fingerprint,
    'status', v_next_status,
    'participantCount', v_participant_count,
    'sourceCount', v_claim.source_count,
    'versions', jsonb_build_object(
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    )
  );

  update public.studio2_operation_receipts receipt
  set
    status = 'succeeded',
    result = v_result,
    completed_at = now(),
    updated_at = now(),
    error_code = null,
    error_metadata = null
  where receipt.operation_id = p_operation_id
    and receipt.command = 'results.calculate'
    and receipt.status = 'processing';

  if not found then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  return v_result;
end
$commit_calculation$;

revoke all on function public.v3_commit_combined_result_calculation_service(
  uuid, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.v3_commit_combined_result_calculation_service(
  uuid, text, text, jsonb, jsonb, jsonb
) to service_role;

comment on function public.v3_begin_combined_result_calculation(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) is
  'Begins one exact-edition Combined Results calculation under an authenticated R2 S2 operation receipt. Trusted server computation must finish through the service-only snapshot/commit boundary.';
comment on function public.v3_commit_combined_result_calculation_service(
  uuid, text, text, jsonb, jsonb, jsonb
) is
  'Service-only atomic commit for the trusted component-pool-v2 engine. Revalidates the frozen input fingerprint and three-way CAS before writing calculation rows and completing the original actor-bound receipt.';

notify pgrst, 'reload schema';

commit;
