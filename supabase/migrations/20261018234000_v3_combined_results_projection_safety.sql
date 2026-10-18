begin;

-- System V3 / #927 projection safety.
--
-- #734 intentionally preserves the last published Combined Televote projection
-- until a newer published version supersedes it. Legacy status writers can,
-- however, move an aggregation away from `published` without withdrawing that
-- projection. Until an explicit governed withdrawal command exists, do not let
-- V3 configuration/destruction silently mutate or delete the source underneath
-- a retained public projection. Recalculation + lock + publish remain available
-- so a genuinely newer result version can supersede the retained publication.

create or replace function public.v3_combined_result_preflight(
  p_edition_id uuid,
  p_aggregation_id uuid,
  p_action text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $preflight$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_detail jsonb;
  v_versions jsonb;
  v_status text;
  v_outdated boolean;
  v_calculation_version integer;
  v_risk text;
  v_requires_reason boolean := false;
  v_requires_confirmation boolean := false;
  v_can_commit boolean := true;
  v_blockers jsonb := '[]'::jsonb;
  v_projection_present boolean := false;
  v_projection_current boolean := false;
begin
  if v_action not in (
    'configure',
    'participants',
    'source',
    'values',
    'recalculate',
    'lock',
    'publish',
    'unlock',
    'delete'
  ) then
    raise exception 'Unsupported Combined Results action' using errcode = '22023';
  end if;

  v_detail := public.v3_combined_result_detail(p_edition_id, p_aggregation_id);
  v_versions := public.v3_combined_result_versions(p_edition_id, p_aggregation_id);
  v_status := v_versions ->> 'status';
  v_outdated := coalesce((v_versions ->> 'resultsOutdated')::boolean, false);
  v_calculation_version := coalesce((v_versions ->> 'calculationVersion')::integer, 0);
  v_projection_present := v_detail -> 'solarisProjection' is not null
    and jsonb_typeof(v_detail -> 'solarisProjection') = 'object';
  v_projection_current := (v_detail ->> 'reconciliationState') = 'in_sync';

  v_risk := case
    when v_action in ('publish', 'unlock', 'delete') then 'R3'
    when v_action in ('recalculate', 'lock', 'participants', 'source', 'values') then 'R2'
    else 'R1'
  end;
  v_requires_reason := v_action in ('publish', 'unlock', 'delete');
  v_requires_confirmation := v_action in ('publish', 'unlock', 'delete');

  if v_action in ('configure', 'participants', 'source', 'values')
     and v_status in ('locked', 'published') then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('immutable_status');
  end if;

  if v_action = 'recalculate'
     and v_status in ('locked', 'published') then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('immutable_status');
  end if;

  if v_action = 'lock'
     and (v_calculation_version < 1 or v_outdated) then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('recalculation_required');
  end if;

  if v_action = 'publish'
     and (
       v_status <> 'locked'
       or v_calculation_version < 1
       or v_outdated
       or (v_detail -> 'participantBinding' ->> 'state') <> 'up_to_date'
     ) then
    v_can_commit := false;
    if v_status <> 'locked' then
      v_blockers := v_blockers || jsonb_build_array('lock_required');
    end if;
    if v_calculation_version < 1 or v_outdated then
      v_blockers := v_blockers || jsonb_build_array('recalculation_required');
    end if;
    if (v_detail -> 'participantBinding' ->> 'state') <> 'up_to_date' then
      v_blockers := v_blockers || jsonb_build_array('participant_binding_not_current');
    end if;
  end if;

  if v_action = 'unlock' and v_status not in ('locked', 'published') then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('not_locked_or_published');
  end if;

  if v_action = 'delete' and v_status = 'published' then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('published_result_cannot_delete');
  end if;

  -- A retained #734 projection is itself publication evidence. Configuration,
  -- destructive delete and unlock would otherwise leave that public snapshot
  -- pointing at a changed/nonexistent source. Fail closed until a governed
  -- withdrawal command owns projection removal. Calculation may still advance
  -- and publish may supersede the retained projection with a newer version.
  if v_projection_present
     and v_action in ('configure', 'participants', 'source', 'values', 'unlock', 'delete') then
    v_can_commit := false;
    v_blockers := v_blockers || jsonb_build_array('published_projection_requires_withdrawal');
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'aggregationId', p_aggregation_id,
    'action', v_action,
    'riskTier', v_risk,
    'requiresReason', v_requires_reason,
    'requiresConfirmation', v_requires_confirmation,
    'canCommit', v_can_commit,
    'blockers', v_blockers,
    'expectedVersions', jsonb_build_object(
      'configVersion', (v_versions ->> 'configVersion')::bigint,
      'stateVersion', (v_versions ->> 'stateVersion')::bigint,
      'calculationVersion', v_calculation_version
    ),
    'impact', jsonb_build_object(
      'participantSnapshot', v_detail -> 'participantBinding',
      'sourceCount', v_detail -> 'sourceSummary' -> 'sourceCount',
      'enabledSourceCount', v_detail -> 'sourceSummary' -> 'enabledSourceCount',
      'sourceScopeMismatchCount', v_detail -> 'sourceSummary' -> 'scopeMismatchCount',
      'storedCalculation', v_detail -> 'currentResult',
      'resultsOutdated', v_outdated,
      'currentStatus', v_status,
      'publishedSolarisProjectionPresent', v_projection_present,
      'publishedSolarisProjectionCurrent', v_projection_current,
      'withdrawalRequiredBeforeSourceMutation',
        v_projection_present
        and v_action in ('configure', 'participants', 'source', 'values', 'unlock', 'delete'),
      'supersessionOrReconciliationRequired',
        v_projection_present
        and v_action in ('recalculate', 'lock', 'publish'),
      'reconciliationState', v_detail ->> 'reconciliationState'
    ),
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.v3_combined_result_preflight(uuid, uuid, text)
  from public, anon;
grant execute on function public.v3_combined_result_preflight(uuid, uuid, text)
  to authenticated, service_role;

comment on function public.v3_combined_result_preflight(uuid, uuid, text) is
  'Exact-edition Combined Results preflight. Retained published Solaris projections fail closed for source/config/destructive mutations until governed withdrawal exists; recalculation/lock/publish may supersede with a newer publication.';

notify pgrst, 'reload schema';

commit;
