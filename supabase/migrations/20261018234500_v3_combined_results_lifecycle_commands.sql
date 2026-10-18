begin;

-- System V3 / #927: governed Combined Results lifecycle.
--
-- The existing S14 publication bridge remains the only Combined -> Solaris
-- Televote projection writer. These commands add exact-edition authority,
-- S2 receipts, three-way CAS and immutable evidence around lock/publish/unlock.
-- Unlocking a currently published Combined source also retracts only the exact
-- derived Solaris projection owned by that source before the operation commits.

create or replace function private.v3_withdraw_combined_published_projection(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $withdraw$
declare
  v_source private.v3_televote_result_projection_sources%rowtype;
  v_deleted_rows integer := 0;
begin
  select source.*
  into v_source
  from private.v3_televote_result_projection_sources source
  where source.source_type = 'combined'
    and source.source_id = p_aggregation_id::text
  for update;

  if v_source.show_id is null then
    return jsonb_build_object(
      'withdrawn', false,
      'reason', 'not_current_projection_source'
    );
  end if;

  if v_source.edition_id is distinct from p_edition_id then
    raise exception using errcode = 'PT409', message = 'PROJECTION_SCOPE_CHANGED';
  end if;

  perform set_config('solaris.v3_televote_projection_write', '1', true);
  perform set_config('solaris.v3_televote_projection_bulk_replace', '1', true);

  delete from public.televote_votes vote
  where vote.show_id = v_source.show_id;
  get diagnostics v_deleted_rows = row_count;

  delete from private.v3_televote_result_projection_sources source
  where source.show_id = v_source.show_id
    and source.source_type = 'combined'
    and source.source_id = p_aggregation_id::text;

  perform set_config('solaris.v3_televote_projection_bulk_replace', '0', true);
  perform public.sync_show_results_from_votes(v_source.show_id);

  return jsonb_build_object(
    'withdrawn', true,
    'showId', v_source.show_id,
    'sourceVersion', v_source.source_version,
    'projectionRevision', v_source.projection_revision,
    'deletedVoteRows', v_deleted_rows
  );
end
$withdraw$;

revoke all on function private.v3_withdraw_combined_published_projection(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_transition_combined_result(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_action text,
  p_expected_config_version bigint,
  p_expected_state_version bigint,
  p_expected_calculation_version integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $transition$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_risk text;
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_previous_status text;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_next_config bigint;
  v_next_state bigint;
  v_next_calculation integer;
  v_next_status text;
  v_projection private.v3_televote_result_projection_sources%rowtype;
  v_projection_effect jsonb := jsonb_build_object('withdrawn', false);
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
     or p_expected_calculation_version < 0
     or v_action not in ('lock', 'publish', 'unlock')
     or (v_reason is not null and length(v_reason) > 1000) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_action in ('publish', 'unlock') and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
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

  v_command := case v_action
    when 'lock' then 'results.lock'
    when 'publish' then 'publication.publish'
    else 'results.unlock'
  end;
  v_risk := case when v_action = 'lock' then 'R2' else 'R3' end;

  -- Claim before mutable-state validation so exact retries after a committed
  -- response loss reconcile the durable operation instead of re-executing.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result'
    ),
    jsonb_build_object(
      'action', v_action,
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
    v_action
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  if v_action = 'lock' and v_aggregation.status <> 'calculated' then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  elsif v_action = 'publish' and v_aggregation.status <> 'locked' then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  elsif v_action = 'unlock' and v_aggregation.status not in ('locked', 'published') then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  v_previous_status := v_aggregation.status;

  if v_action = 'lock' then
    update televoting.televote_aggregations aggregation
    set
      status = 'locked',
      locked_at = now(),
      published_at = null
    where aggregation.id = p_aggregation_id;
  elsif v_action = 'publish' then
    update televoting.televote_aggregations aggregation
    set
      status = 'published',
      published_at = now()
    where aggregation.id = p_aggregation_id;

    -- The S14 trigger is the canonical publication bridge. Do not report
    -- publication success unless that exact calculation version became the
    -- current Solaris Televote projection in this transaction.
    select source.*
    into v_projection
    from private.v3_televote_result_projection_sources source
    where source.source_type = 'combined'
      and source.source_id = p_aggregation_id::text
    for share;

    if v_projection.show_id is null
       or v_projection.edition_id is distinct from p_edition_id
       or v_projection.source_version is distinct from p_expected_calculation_version then
      raise exception using errcode = '23514', message = 'SOLARIS_PROJECTION_NOT_CURRENT';
    end if;

    v_projection_effect := jsonb_build_object(
      'published', true,
      'showId', v_projection.show_id,
      'sourceVersion', v_projection.source_version,
      'projectionRevision', v_projection.projection_revision,
      'rowCount', v_projection.row_count,
      'pointsTotal', v_projection.points_total
    );
  else
    update televoting.televote_aggregations aggregation
    set
      status = 'calculated',
      locked_at = null,
      published_at = null
    where aggregation.id = p_aggregation_id;

    if v_previous_status = 'published' then
      v_projection_effect := private.v3_withdraw_combined_published_projection(
        p_edition_id,
        p_aggregation_id
      );
    end if;
  end if;

  select
    aggregation.config_version,
    aggregation.state_version,
    aggregation.calculation_version,
    aggregation.status
  into v_next_config, v_next_state, v_next_calculation, v_next_status
  from televoting.televote_aggregations aggregation
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
  ) values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    case v_action
      when 'lock' then 'lock_combined_televote'
      when 'publish' then 'publish_combined_televote'
      else 'unlock_combined_televote'
    end,
    'televote_aggregation',
    p_aggregation_id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'configVersion', p_expected_config_version,
      'stateVersion', p_expected_state_version,
      'calculationVersion', p_expected_calculation_version
    ),
    jsonb_build_object(
      'status', v_next_status,
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation,
      'projection', v_projection_effect
    ),
    v_reason
  );

  if v_action = 'lock' then
    perform private.v3_emit_domain_event(
      'results.locked',
      'combined_result',
      p_aggregation_id::text,
      v_next_state,
      v_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'resultKind', 'combined_televote',
        'locked', true,
        'stateVersion', v_next_state,
        'calculationVersion', v_next_calculation
      ),
      1,
      array[]::text[]
    );
  elsif v_action = 'publish' or v_previous_status = 'published' then
    perform private.v3_emit_domain_event(
      'publication.changed',
      'combined_result',
      p_aggregation_id::text,
      v_next_state,
      v_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'publicationKind', 'combined_televote',
        'published', v_action = 'publish',
        'stateVersion', v_next_state,
        'calculationVersion', v_next_calculation,
        'projection', v_projection_effect
      ),
      1,
      array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'changed', true,
    'riskClass', v_risk,
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'action', v_action,
    'operationId', v_operation_id,
    'previousStatus', v_previous_status,
    'status', v_next_status,
    'previousVersions', jsonb_build_object(
      'configVersion', p_expected_config_version,
      'stateVersion', p_expected_state_version,
      'calculationVersion', p_expected_calculation_version
    ),
    'versions', jsonb_build_object(
      'configVersion', v_next_config,
      'stateVersion', v_next_state,
      'calculationVersion', v_next_calculation
    ),
    'projection', v_projection_effect
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$transition$;

revoke all on function public.v3_transition_combined_result(
  uuid, uuid, text, bigint, bigint, integer, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_transition_combined_result(
  uuid, uuid, text, bigint, bigint, integer, uuid, text, text, uuid
) to authenticated, service_role;

comment on function public.v3_transition_combined_result(
  uuid, uuid, text, bigint, bigint, integer, uuid, text, text, uuid
) is
  'Canonical exact-edition Combined Results lock/publish/unlock command with S2 replay, three-way CAS and deterministic Solaris projection reconciliation.';

notify pgrst, 'reload schema';

commit;
