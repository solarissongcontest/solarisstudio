begin;

select public.v3_register_migration_contract(
  'v3.results.combined-config-command',
  1,
  'forward_fix_only',
  false,
  null,
  'Add the governed exact-edition Combined Results configuration command with S2 replay and three-way CAS.'
);

-- System V3 / #927, first governed Combined Results mutation.
--
-- Replace the legacy top-level Combined configuration writer with one exact-
-- edition command that participates in the canonical S2 operation contract,
-- binds every relevant CAS version and emits immutable audit/domain evidence.

create or replace function public.v3_configure_combined_result(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_name text,
  p_total_points integer,
  p_rank_exponent numeric,
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
as $configure$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_changed boolean := false;
  v_next_config bigint;
  v_next_state bigint;
  v_next_calculation integer;
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
  if v_name is null or length(v_name) > 240 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_total_points is null or p_total_points not between 1 and 1000000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_rank_exponent is null or p_rank_exponent <= 0 or p_rank_exponent > 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_reason is not null and length(v_reason) > 1000 then
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

  -- Claim before mutable-state validation so a successfully committed command
  -- can be replayed after a lost response even though CAS has advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'voting.configure',
    'R1',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result'
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'name', v_name,
      'totalPoints', p_total_points,
      'rankExponent', p_rank_exponent,
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

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id
  for update;

  -- Re-resolve exact edition under the same transaction as the mutation.
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
    'configure'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  v_changed := v_aggregation.name is distinct from v_name
    or v_aggregation.total_points_to_distribute is distinct from p_total_points
    or v_aggregation.rank_exponent is distinct from p_rank_exponent;

  if v_changed then
    update televoting.televote_aggregations aggregation
    set
      name = v_name,
      total_points_to_distribute = p_total_points,
      rank_exponent = p_rank_exponent,
      results_outdated = case
        when aggregation.calculation_version > 0 then true
        else aggregation.results_outdated
      end
    where aggregation.id = p_aggregation_id;

    insert into televoting.admin_audit_log (
      actor_admin_id,
      actor_username,
      action,
      target_type,
      target_id,
      old_values,
      new_values,
      reason
    )
    values (
      auth.uid(),
      coalesce(
        auth.jwt() ->> 'email',
        auth.jwt() -> 'user_metadata' ->> 'display_name',
        auth.uid()::text
      ),
      'configure_combined_result',
      'televote_aggregation',
      p_aggregation_id::text,
      jsonb_build_object(
        'name', v_aggregation.name,
        'totalPoints', v_aggregation.total_points_to_distribute,
        'rankExponent', v_aggregation.rank_exponent,
        'configVersion', v_aggregation.config_version,
        'stateVersion', v_aggregation.state_version,
        'calculationVersion', v_aggregation.calculation_version
      ),
      jsonb_build_object(
        'name', v_name,
        'totalPoints', p_total_points,
        'rankExponent', p_rank_exponent
      ),
      v_reason
    );
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
      null,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'configVersion', v_next_config,
        'stateVersion', v_next_state,
        'calculationVersion', v_next_calculation,
        'changedFields', jsonb_build_array('name', 'totalPoints', 'rankExponent'),
        'resultsOutdated', (
          select aggregation.results_outdated
          from televoting.televote_aggregations aggregation
          where aggregation.id = p_aggregation_id
        )
      ),
      1,
      array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'changed', v_changed,
    'riskClass', 'R1',
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'operationId', v_operation_id,
    'previousVersions', jsonb_build_object(
      'configVersion', p_expected_config_version,
      'stateVersion', p_expected_state_version,
      'calculationVersion', p_expected_calculation_version
    ),
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
$configure$;

revoke all on function public.v3_configure_combined_result(
  uuid, uuid, text, integer, numeric, bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_configure_combined_result(
  uuid, uuid, text, integer, numeric, bigint, bigint, integer, uuid, text, uuid, text
) to authenticated, service_role;

comment on function public.v3_configure_combined_result(
  uuid, uuid, text, integer, numeric, bigint, bigint, integer, uuid, text, uuid, text
) is
  'Canonical exact-edition Combined Results configuration command with S2 receipt replay, three-way CAS, immutable audit and voting.configuration_changed evidence.';

notify pgrst, 'reload schema';

commit;