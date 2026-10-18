begin;

-- System V3 / #927: governed Combined source configuration. Source rows are
-- child configuration, so command lock order follows legacy coexistence:
-- existing source row first, aggregate CAS row second. Batch mode suppresses
-- child-trigger version churn; one logical command advances config CAS once.

create or replace function private.v3_validate_combined_source_round(
  p_edition_id uuid,
  p_remote_edition_id uuid,
  p_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $validate$
declare
  v_round_edition uuid;
  v_binding public.televoting_round_bindings%rowtype;
begin
  if p_round_id is null then
    return jsonb_build_object(
      'roundId', null,
      'showId', null,
      'scopeState', 'manual'
    );
  end if;

  select round_row.edition_id
  into v_round_edition
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round_edition is null then
    raise exception 'Combined source round not found' using errcode = 'P0002';
  end if;
  if v_round_edition is distinct from p_remote_edition_id then
    raise exception 'Combined source round belongs to another Televoting edition'
      using errcode = '42501';
  end if;

  select binding.*
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  if v_binding.remote_round_id is null
     or v_binding.show_id is null
     or v_binding.edition_id is distinct from p_edition_id then
    raise exception 'Combined source round is not bound to the reviewed Solaris edition'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = v_binding.show_id
      and show_row.edition_id = p_edition_id
  ) then
    raise exception 'Combined source round binding does not resolve to the reviewed edition'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'roundId', p_round_id,
    'showId', v_binding.show_id,
    'scopeState', 'exact_edition'
  );
end
$validate$;

revoke all on function private.v3_validate_combined_source_round(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_upsert_combined_result_source(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_source_id uuid,
  p_source_type text,
  p_input_mode text,
  p_round_id uuid,
  p_name text,
  p_weight numeric,
  p_enabled boolean,
  p_display_order integer,
  p_correction_scope text,
  p_correction_target_source_id uuid,
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
as $upsert$
declare
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_input_mode text := lower(btrim(coalesce(p_input_mode, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_correction_scope text := lower(btrim(coalesce(p_correction_scope, 'final')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_existing televoting.televote_aggregation_sources%rowtype;
  v_target_source televoting.televote_aggregation_sources%rowtype;
  v_round_evidence jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_result_source_id uuid;
  v_changed boolean := false;
  v_next_config bigint;
  v_next_state bigint;
  v_next_calculation integer;
  v_effective_weight numeric;
  v_result jsonb;
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
     or p_expected_calculation_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_source_type = ''
     or v_source_type !~ '^[a-z][a-z0-9_-]{0,63}$'
     or v_input_mode not in ('raw_results', 'converted_points', 'activity_points', 'correction')
     or v_name is null
     or length(v_name) > 240
     or p_weight is null
     or p_weight < 0
     or p_weight > 100
     or p_enabled is null
     or p_display_order is null
     or p_display_order not between 0 and 1000
     or v_correction_scope not in ('source', 'final')
     or (v_reason is not null and length(v_reason) > 1000) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_input_mode = 'correction' and p_round_id is not null then
    raise exception 'Correction sources cannot bind a voting round'
      using errcode = '22023';
  end if;
  if v_input_mode <> 'correction' and p_correction_target_source_id is not null then
    raise exception 'Only correction sources may target another source'
      using errcode = '22023';
  end if;
  if v_input_mode = 'correction'
     and v_correction_scope = 'source'
     and p_correction_target_source_id is null then
    raise exception 'Source-scoped correction requires a target source'
      using errcode = '22023';
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

  if p_source_id is not null then
    select source.*
    into v_existing
    from televoting.televote_aggregation_sources source
    where source.id = p_source_id;
    if v_existing.id is null then
      raise exception 'Combined source not found' using errcode = 'P0002';
    end if;
    if v_existing.aggregation_id is distinct from p_aggregation_id then
      raise exception 'Combined source is outside the reviewed aggregation'
        using errcode = '42501';
    end if;
  end if;

  if p_correction_target_source_id is not null then
    select source.*
    into v_target_source
    from televoting.televote_aggregation_sources source
    where source.id = p_correction_target_source_id;
    if v_target_source.id is null
       or v_target_source.aggregation_id is distinct from p_aggregation_id then
      raise exception 'Correction target is outside the reviewed aggregation'
        using errcode = '42501';
    end if;
    if p_source_id is not null and p_correction_target_source_id = p_source_id then
      raise exception 'Correction source cannot target itself'
        using errcode = '22023';
    end if;
  end if;

  v_round_evidence := private.v3_validate_combined_source_round(
    p_edition_id,
    v_remote_edition_id,
    p_round_id
  );
  v_effective_weight := case when v_input_mode = 'correction' then 0 else p_weight end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'voting.configure',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result_source',
      'subjectId', p_source_id
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'sourceId', p_source_id,
      'sourceType', v_source_type,
      'inputMode', v_input_mode,
      'roundId', p_round_id,
      'name', v_name,
      'weight', v_effective_weight,
      'enabled', p_enabled,
      'displayOrder', p_display_order,
      'correctionScope', v_correction_scope,
      'correctionTargetSourceId', p_correction_target_source_id,
      'expectedConfigVersion', p_expected_config_version,
      'expectedStateVersion', p_expected_state_version,
      'expectedCalculationVersion', p_expected_calculation_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Child-first lock order matches legacy source mutation -> invalidation trigger
  -- -> aggregate update and avoids an aggregate/child deadlock during cutover.
  if p_source_id is not null then
    select source.*
    into v_existing
    from televoting.televote_aggregation_sources source
    where source.id = p_source_id
    for update;
    if v_existing.id is null
       or v_existing.aggregation_id is distinct from p_aggregation_id then
      raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
    end if;
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id
  for update;

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
    'source'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  -- Source round binding can change while the edit form is open. Resolve it
  -- again inside the locked mutation transaction.
  v_round_evidence := private.v3_validate_combined_source_round(
    p_edition_id,
    v_remote_edition_id,
    p_round_id
  );

  if p_correction_target_source_id is not null then
    select source.*
    into v_target_source
    from televoting.televote_aggregation_sources source
    where source.id = p_correction_target_source_id;
    if v_target_source.id is null
       or v_target_source.aggregation_id is distinct from p_aggregation_id then
      raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
    end if;
  end if;

  v_changed := p_source_id is null
    or v_existing.source_type is distinct from v_source_type
    or v_existing.input_mode is distinct from v_input_mode
    or v_existing.source_round_id is distinct from p_round_id
    or v_existing.source_name is distinct from v_name
    or v_existing.percentage_weight is distinct from v_effective_weight
    or v_existing.enabled is distinct from p_enabled
    or v_existing.display_order is distinct from p_display_order
    or v_existing.correction_scope is distinct from v_correction_scope
    or v_existing.correction_target_source_id is distinct from p_correction_target_source_id;

  if v_changed then
    perform set_config('solaris.v3_combined_config_batch', '1', true);

    if p_source_id is null then
      insert into televoting.televote_aggregation_sources (
        aggregation_id,
        source_type,
        input_mode,
        source_round_id,
        source_name,
        calculation_stage,
        calculation_method,
        percentage_weight,
        weight,
        enabled,
        display_order,
        correction_scope,
        correction_target_source_id
      ) values (
        p_aggregation_id,
        v_source_type,
        v_input_mode,
        p_round_id,
        v_name,
        case when v_input_mode = 'correction' then 'post_conversion' else 'pre_conversion' end,
        v_input_mode,
        v_effective_weight,
        v_effective_weight,
        p_enabled,
        p_display_order,
        v_correction_scope,
        p_correction_target_source_id
      )
      returning id into v_result_source_id;
    else
      update televoting.televote_aggregation_sources source
      set
        source_type = v_source_type,
        input_mode = v_input_mode,
        source_round_id = p_round_id,
        source_name = v_name,
        calculation_stage = case when v_input_mode = 'correction' then 'post_conversion' else 'pre_conversion' end,
        calculation_method = v_input_mode,
        percentage_weight = v_effective_weight,
        weight = v_effective_weight,
        enabled = p_enabled,
        display_order = p_display_order,
        correction_scope = v_correction_scope,
        correction_target_source_id = p_correction_target_source_id
      where source.id = p_source_id;
      v_result_source_id := p_source_id;
    end if;

    perform set_config('solaris.v3_combined_config_batch', '0', true);
    perform private.v3_touch_combined_configuration(p_aggregation_id);

    insert into televoting.admin_audit_log (
      actor_admin_id,
      actor_username,
      action,
      target_type,
      target_id,
      old_values,
      new_values,
      reason
    ) values (
      auth.uid(),
      coalesce(
        auth.jwt() ->> 'email',
        auth.jwt() -> 'user_metadata' ->> 'display_name',
        auth.uid()::text
      ),
      case when p_source_id is null then 'create_combined_source' else 'update_combined_source' end,
      'televote_aggregation',
      p_aggregation_id::text,
      case when p_source_id is null then null else jsonb_build_object(
        'sourceId', v_existing.id,
        'sourceType', v_existing.source_type,
        'inputMode', v_existing.input_mode,
        'roundId', v_existing.source_round_id,
        'name', v_existing.source_name,
        'weight', v_existing.percentage_weight,
        'enabled', v_existing.enabled,
        'displayOrder', v_existing.display_order
      ) end,
      jsonb_build_object(
        'sourceId', v_result_source_id,
        'sourceType', v_source_type,
        'inputMode', v_input_mode,
        'roundId', p_round_id,
        'name', v_name,
        'weight', v_effective_weight,
        'enabled', p_enabled,
        'displayOrder', p_display_order,
        'scope', v_round_evidence
      ),
      v_reason
    );
  else
    v_result_source_id := p_source_id;
  end if;

  select
    aggregation.config_version,
    aggregation.state_version,
    aggregation.calculation_version
  into v_next_config, v_next_state, v_next_calculation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  if v_changed then
    perform private.v3_emit_domain_event(
      'voting.configuration_changed',
      'combined_result',
      p_aggregation_id::text,
      v_next_config,
      v_operation_id,
      p_edition_id,
      nullif(v_round_evidence ->> 'showId', '')::uuid,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'change', case when p_source_id is null then 'source_created' else 'source_updated' end,
        'sourceId', v_result_source_id,
        'inputMode', v_input_mode,
        'roundBound', p_round_id is not null,
        'configVersion', v_next_config,
        'stateVersion', v_next_state,
        'calculationVersion', v_next_calculation
      ),
      1,
      array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'changed', v_changed,
    'riskClass', 'R2',
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'sourceId', v_result_source_id,
    'sourceScope', v_round_evidence,
    'operationId', v_operation_id,
    'versions', jsonb_build_object(
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    )
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$upsert$;

revoke all on function public.v3_upsert_combined_result_source(
  uuid, uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, uuid,
  bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_upsert_combined_result_source(
  uuid, uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, uuid,
  bigint, bigint, integer, uuid, text, uuid, text
) to authenticated, service_role;

create or replace function public.v3_delete_combined_result_source(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_source_id uuid,
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
as $delete$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_source televoting.televote_aggregation_sources%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_value_count integer := 0;
  v_next_config bigint;
  v_next_state bigint;
  v_next_calculation integer;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_aggregation_id is null
     or p_source_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_config_version is null
     or p_expected_state_version is null
     or p_expected_calculation_version is null
     or p_expected_config_version < 0
     or p_expected_state_version < 0
     or p_expected_calculation_version < 0
     or v_reason is null
     or length(v_reason) > 1000 then
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

  select source.*
  into v_source
  from televoting.televote_aggregation_sources source
  where source.id = p_source_id;
  if v_source.id is null then
    raise exception 'Combined source not found' using errcode = 'P0002';
  end if;
  if v_source.aggregation_id is distinct from p_aggregation_id then
    raise exception 'Combined source is outside the reviewed aggregation'
      using errcode = '42501';
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;
  if v_aggregation.id is null
     or v_aggregation.edition_id is distinct from v_remote_edition_id then
    raise exception 'Combined result is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'voting.configure',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result_source',
      'subjectId', p_source_id
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'sourceId', p_source_id,
      'action', 'delete',
      'expectedConfigVersion', p_expected_config_version,
      'expectedStateVersion', p_expected_state_version,
      'expectedCalculationVersion', p_expected_calculation_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select source.*
  into v_source
  from televoting.televote_aggregation_sources source
  where source.id = p_source_id
  for update;
  if v_source.id is null
     or v_source.aggregation_id is distinct from p_aggregation_id then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id
  for update;

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
    'source'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  if exists (
    select 1
    from televoting.televote_aggregation_sources dependent
    where dependent.aggregation_id = p_aggregation_id
      and dependent.correction_target_source_id = p_source_id
      and dependent.id <> p_source_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = 'Remove or retarget dependent correction sources before deleting this source.';
  end if;

  select count(*)::integer
  into v_value_count
  from televoting.external_score_entries entry
  where entry.source_id = p_source_id;

  perform set_config('solaris.v3_combined_config_batch', '1', true);
  delete from televoting.external_score_entries entry where entry.source_id = p_source_id;
  delete from televoting.televote_aggregation_sources source where source.id = p_source_id;
  perform set_config('solaris.v3_combined_config_batch', '0', true);
  perform private.v3_touch_combined_configuration(p_aggregation_id);

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values,
    reason
  ) values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    'delete_combined_source',
    'televote_aggregation',
    p_aggregation_id::text,
    jsonb_build_object(
      'sourceId', v_source.id,
      'sourceType', v_source.source_type,
      'inputMode', v_source.input_mode,
      'roundId', v_source.source_round_id,
      'name', v_source.source_name,
      'manualValueCount', v_value_count
    ),
    jsonb_build_object('deleted', true),
    v_reason
  );

  select
    aggregation.config_version,
    aggregation.state_version,
    aggregation.calculation_version
  into v_next_config, v_next_state, v_next_calculation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  perform private.v3_emit_domain_event(
    'voting.configuration_changed',
    'combined_result',
    p_aggregation_id::text,
    v_next_config,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'change', 'source_deleted',
      'sourceId', p_source_id,
      'manualValueCount', v_value_count,
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
    'changed', true,
    'riskClass', 'R2',
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'sourceId', p_source_id,
    'deletedManualValueCount', v_value_count,
    'operationId', v_operation_id,
    'versions', jsonb_build_object(
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    )
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$delete$;

revoke all on function public.v3_delete_combined_result_source(
  uuid, uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_delete_combined_result_source(
  uuid, uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
