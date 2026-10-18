begin;

-- System V3 / #927: governed Combined aggregation create/delete. Creation is
-- exact-edition and receipt-backed. Destruction is R3, reasoned, CAS-bound and
-- captures cascade impact before suppressing child invalidation triggers.

create or replace function public.v3_create_combined_result(
  p_edition_id uuid,
  p_name text,
  p_total_points integer,
  p_rank_exponent numeric,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $create$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_aggregation_id uuid;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_name is null
     or length(v_name) > 240
     or p_total_points is null
     or p_total_points not between 1 and 1000000
     or p_rank_exponent is null
     or p_rank_exponent <= 0
     or p_rank_exponent > 100
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

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'voting.configure',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'combined_result'
    ),
    jsonb_build_object(
      'action', 'create',
      'name', v_name,
      'totalPoints', p_total_points,
      'rankExponent', p_rank_exponent,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Link identity is mutable administration state. Resolve again immediately
  -- before the insert so a removed/repointed edition link cannot be ignored.
  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);
  if v_remote_edition_id is null then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  insert into televoting.televote_aggregations (
    edition_id,
    name,
    combination_method,
    total_points_to_distribute,
    rank_exponent,
    status,
    calculation_version,
    results_outdated,
    broadcast_display_mode,
    config_version,
    state_version
  ) values (
    v_remote_edition_id,
    v_name,
    'component_pool',
    p_total_points,
    p_rank_exponent,
    'draft',
    0,
    true,
    'combined',
    1,
    1
  )
  returning id into v_aggregation_id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    new_values,
    reason
  ) values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    'create_combined_televote',
    'televote_aggregation',
    v_aggregation_id::text,
    jsonb_build_object(
      'name', v_name,
      'totalPoints', p_total_points,
      'rankExponent', p_rank_exponent,
      'configVersion', 1,
      'stateVersion', 1,
      'calculationVersion', 0
    ),
    v_reason
  );

  perform private.v3_emit_domain_event(
    'voting.configuration_changed',
    'combined_result',
    v_aggregation_id::text,
    1,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'aggregationId', v_aggregation_id,
      'change', 'aggregation_created',
      'configVersion', 1,
      'stateVersion', 1,
      'calculationVersion', 0
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
    'aggregationId', v_aggregation_id,
    'operationId', v_operation_id,
    'versions', jsonb_build_object(
      'configVersion', 1,
      'stateVersion', 1,
      'calculationVersion', 0
    )
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$create$;

revoke all on function public.v3_create_combined_result(
  uuid, text, integer, numeric, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_create_combined_result(
  uuid, text, integer, numeric, uuid, text, uuid, text
) to authenticated, service_role;

create or replace function public.v3_delete_combined_result(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_expected_config_version bigint,
  p_expected_state_version bigint,
  p_expected_calculation_version integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_correlation_id uuid default null
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
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_source_count integer := 0;
  v_participant_count integer := 0;
  v_manual_value_count integer := 0;
  v_component_result_count integer := 0;
  v_final_result_count integer := 0;
  v_tombstone_version bigint;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_aggregation_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_reason is null
     or length(v_reason) > 1000
     or p_expected_config_version is null
     or p_expected_state_version is null
     or p_expected_calculation_version is null
     or p_expected_config_version < 0
     or p_expected_state_version < 0
     or p_expected_calculation_version < 0 then
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
    'voting.configure',
    'R3',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result'
    ),
    jsonb_build_object(
      'action', 'delete',
      'aggregationId', p_aggregation_id,
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

  -- Lock physical children before the parent aggregate to coexist safely with
  -- legacy writers whose invalidation triggers touch the aggregate afterwards.
  perform 1
  from televoting.external_score_entries entry
  join televoting.televote_aggregation_sources source on source.id = entry.source_id
  where source.aggregation_id = p_aggregation_id
  order by entry.id
  for update of entry;

  perform 1
  from televoting.televote_aggregation_sources source
  where source.aggregation_id = p_aggregation_id
  order by source.id
  for update;

  perform 1
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = p_aggregation_id
  order by participant.country_code
  for update;

  perform 1
  from televoting.combined_televote_component_results component
  where component.aggregation_id = p_aggregation_id
  order by component.id
  for update;

  perform 1
  from televoting.combined_televote_results result_row
  where result_row.aggregation_id = p_aggregation_id
  order by result_row.id
  for update;

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
    'delete'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  select count(*)::integer
  into v_source_count
  from televoting.televote_aggregation_sources source
  where source.aggregation_id = p_aggregation_id;
  select count(*)::integer
  into v_participant_count
  from televoting.televote_aggregation_participants participant
  where participant.aggregation_id = p_aggregation_id;
  select count(*)::integer
  into v_manual_value_count
  from televoting.external_score_entries entry
  join televoting.televote_aggregation_sources source on source.id = entry.source_id
  where source.aggregation_id = p_aggregation_id;
  select count(*)::integer
  into v_component_result_count
  from televoting.combined_televote_component_results component
  where component.aggregation_id = p_aggregation_id;
  select count(*)::integer
  into v_final_result_count
  from televoting.combined_televote_results result_row
  where result_row.aggregation_id = p_aggregation_id;

  v_tombstone_version := greatest(
    v_aggregation.config_version,
    v_aggregation.state_version,
    v_aggregation.calculation_version::bigint
  ) + 1;

  perform set_config('solaris.v3_combined_config_batch', '1', true);
  delete from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;
  perform set_config('solaris.v3_combined_config_batch', '0', true);

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
    'delete_combined_televote',
    'televote_aggregation',
    p_aggregation_id::text,
    jsonb_build_object(
      'name', v_aggregation.name,
      'status', v_aggregation.status,
      'configVersion', v_aggregation.config_version,
      'stateVersion', v_aggregation.state_version,
      'calculationVersion', v_aggregation.calculation_version,
      'sourceCount', v_source_count,
      'participantCount', v_participant_count,
      'manualValueCount', v_manual_value_count,
      'componentResultCount', v_component_result_count,
      'finalResultCount', v_final_result_count
    ),
    jsonb_build_object('deleted', true, 'tombstoneVersion', v_tombstone_version),
    v_reason
  );

  perform private.v3_emit_domain_event(
    'voting.configuration_changed',
    'combined_result',
    p_aggregation_id::text,
    v_tombstone_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'change', 'aggregation_deleted',
      'tombstoneVersion', v_tombstone_version,
      'sourceCount', v_source_count,
      'participantCount', v_participant_count,
      'manualValueCount', v_manual_value_count,
      'componentResultCount', v_component_result_count,
      'finalResultCount', v_final_result_count
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'changed', true,
    'riskClass', 'R3',
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'deleted', true,
    'tombstoneVersion', v_tombstone_version,
    'impact', jsonb_build_object(
      'sourceCount', v_source_count,
      'participantCount', v_participant_count,
      'manualValueCount', v_manual_value_count,
      'componentResultCount', v_component_result_count,
      'finalResultCount', v_final_result_count
    ),
    'operationId', v_operation_id
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$delete$;

revoke all on function public.v3_delete_combined_result(
  uuid, uuid, bigint, bigint, integer, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_delete_combined_result(
  uuid, uuid, bigint, bigint, integer, uuid, text, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
