begin;

-- System V3 / #927: governed manual Combined source values. The caller may
-- replace values only for an existing manual source and only for participant
-- identities already present in the exact aggregation snapshot. The payload is
-- bounded before any receipt or table mutation is attempted.

create or replace function public.v3_save_combined_result_source_values(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_source_id uuid,
  p_values jsonb,
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
as $save$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_source televoting.televote_aggregation_sources%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_normalized jsonb := '{}'::jsonb;
  v_current jsonb := '{}'::jsonb;
  v_value_count integer := 0;
  v_nonzero_count integer := 0;
  v_changed_count integer := 0;
  v_changed boolean := false;
  v_next_config bigint;
  v_next_state bigint;
  v_next_calculation integer;
  v_actor text;
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
     or jsonb_typeof(coalesce(p_values, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_values) > 65536
     or (v_reason is not null and length(v_reason) > 1000) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select count(*)::integer
  into v_value_count
  from jsonb_each(p_values);
  if v_value_count > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if exists (
    select 1
    from jsonb_each(p_values) item(key, value)
    where nullif(btrim(item.key), '') is null
       or length(btrim(item.key)) > 32
       or jsonb_typeof(item.value) <> 'number'
       or abs((item.value #>> '{}')::numeric) > 1000000000000
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if exists (
    select 1
    from (
      select upper(btrim(item.key)) as code, count(*)
      from jsonb_each(p_values) item(key, value)
      group by upper(btrim(item.key))
      having count(*) > 1
    ) duplicate
  ) then
    raise exception 'Manual value country codes collide after normalization'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_object_agg(normalized.code, normalized.value order by normalized.code),
    '{}'::jsonb
  )
  into v_normalized
  from (
    select
      upper(btrim(item.key)) as code,
      (item.value #>> '{}')::numeric as value
    from jsonb_each(p_values) item(key, value)
  ) normalized;

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
  if v_source.source_round_id is not null then
    raise exception 'Round-backed Combined source values are derived and cannot be edited manually'
      using errcode = '23514';
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

  if exists (
    select 1
    from jsonb_each(v_normalized) item(key, value)
    where not exists (
      select 1
      from televoting.televote_aggregation_participants participant
      where participant.aggregation_id = p_aggregation_id
        and upper(btrim(participant.country_code)) = item.key
    )
  ) then
    raise exception 'Manual value references a country outside the Combined participant snapshot'
      using errcode = '23514';
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
      'subjectType', 'combined_result_source_values',
      'subjectId', p_source_id
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'sourceId', p_source_id,
      'values', v_normalized,
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

  -- Match legacy value-write lock order: existing value rows first, then the
  -- owning source, then the aggregation CAS row.
  perform 1
  from televoting.external_score_entries entry
  where entry.source_id = p_source_id
  order by entry.id
  for update;

  select source.*
  into v_source
  from televoting.televote_aggregation_sources source
  where source.id = p_source_id
  for update;
  if v_source.id is null
     or v_source.aggregation_id is distinct from p_aggregation_id
     or v_source.source_round_id is not null then
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
    'values'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  -- Participant identity can change through legacy paths while an edit form is
  -- open, so validate the normalized payload again inside the locked command.
  if exists (
    select 1
    from jsonb_each(v_normalized) item(key, value)
    where not exists (
      select 1
      from televoting.televote_aggregation_participants participant
      where participant.aggregation_id = p_aggregation_id
        and upper(btrim(participant.country_code)) = item.key
    )
  ) then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select coalesce(
    jsonb_object_agg(
      upper(btrim(entry.country_code)),
      entry.value
      order by upper(btrim(entry.country_code))
    ),
    '{}'::jsonb
  )
  into v_current
  from televoting.external_score_entries entry
  where entry.source_id = p_source_id;

  v_changed := v_current is distinct from v_normalized;
  v_actor := coalesce(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'display_name',
    auth.uid()::text
  );

  if v_changed then
    select count(*)::integer
    into v_changed_count
    from (
      select code
      from (
        select key as code, (value #>> '{}')::numeric as value
        from jsonb_each(v_current)
        union
        select key as code, (value #>> '{}')::numeric as value
        from jsonb_each(v_normalized)
      ) all_codes
      group by code
      having max(value) is distinct from min(value)
         or count(*) = 1
    ) changes;

    insert into televoting.external_score_entry_log (
      source_id,
      aggregation_id,
      country_code,
      previous_value,
      new_value,
      delta,
      entry_type,
      reason,
      actor_username
    )
    select
      p_source_id,
      p_aggregation_id,
      codes.code,
      old_values.value,
      new_values.value,
      coalesce(new_values.value, 0) - coalesce(old_values.value, 0),
      v_source.input_mode,
      v_reason,
      v_actor
    from (
      select key as code from jsonb_each(v_current)
      union
      select key as code from jsonb_each(v_normalized)
    ) codes
    left join lateral (
      select (v_current ->> codes.code)::numeric as value
    ) old_values on true
    left join lateral (
      select (v_normalized ->> codes.code)::numeric as value
    ) new_values on true
    where old_values.value is distinct from new_values.value;

    perform set_config('solaris.v3_combined_config_batch', '1', true);
    delete from televoting.external_score_entries entry
    where entry.source_id = p_source_id;

    insert into televoting.external_score_entries (
      source_id,
      country_code,
      value,
      entry_type,
      reason,
      entered_by
    )
    select
      p_source_id,
      item.key,
      (item.value #>> '{}')::numeric,
      v_source.input_mode,
      v_reason,
      v_actor
    from jsonb_each(v_normalized) item(key, value)
    where (item.value #>> '{}')::numeric <> 0;

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
      v_actor,
      'save_combined_source_values',
      'televote_aggregation',
      p_aggregation_id::text,
      jsonb_build_object(
        'sourceId', p_source_id,
        'valueCount', (select count(*) from jsonb_each(v_current))
      ),
      jsonb_build_object(
        'sourceId', p_source_id,
        'valueCount', v_value_count,
        'changedValueCount', v_changed_count
      ),
      v_reason
    );
  end if;

  select count(*)::integer
  into v_nonzero_count
  from jsonb_each(v_normalized) item(key, value)
  where (item.value #>> '{}')::numeric <> 0;

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
      null,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'change', 'manual_source_values_replaced',
        'sourceId', p_source_id,
        'valueCount', v_value_count,
        'nonzeroValueCount', v_nonzero_count,
        'changedValueCount', v_changed_count,
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
    'sourceId', p_source_id,
    'valueCount', v_value_count,
    'nonzeroValueCount', v_nonzero_count,
    'changedValueCount', v_changed_count,
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
$save$;

revoke all on function public.v3_save_combined_result_source_values(
  uuid, uuid, uuid, jsonb, bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_save_combined_result_source_values(
  uuid, uuid, uuid, jsonb, bigint, bigint, integer, uuid, text, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
