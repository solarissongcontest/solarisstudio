begin;

select public.v3_register_migration_contract(
  'v3.results.combined-cas-preflight',
  1,
  'forward_fix_only',
  false,
  null,
  'Add Combined Results configuration/state CAS versions and exact-edition observational preflight on the current V3 schema.'
);

-- System V3 / #927, second vertical slice.
--
-- The legacy Combined engine only versioned calculations. That cannot protect
-- Organizer mutations from concurrent configuration or lifecycle changes, so
-- add two independent monotonic versions. Triggers keep them truthful even
-- while legacy writers still coexist during cutover.

alter table televoting.televote_aggregations
  add column if not exists config_version bigint not null default 0,
  add column if not exists state_version bigint not null default 0;

create or replace function private.v3_bump_combined_aggregation_versions()
returns trigger
language plpgsql
set search_path = pg_catalog, televoting
as $versions$
begin
  if new.config_version = old.config_version
     and (
       new.edition_id is distinct from old.edition_id
       or new.name is distinct from old.name
       or new.combination_method is distinct from old.combination_method
       or new.total_points_to_distribute is distinct from old.total_points_to_distribute
       or new.rank_exponent is distinct from old.rank_exponent
       or new.public_columns is distinct from old.public_columns
       or new.broadcast_display_mode is distinct from old.broadcast_display_mode
     ) then
    new.config_version := old.config_version + 1;
  end if;

  if new.state_version = old.state_version
     and (
       new.status is distinct from old.status
       or new.calculation_version is distinct from old.calculation_version
       or new.calculated_at is distinct from old.calculated_at
       or new.locked_at is distinct from old.locked_at
       or new.published_at is distinct from old.published_at
       or new.results_outdated is distinct from old.results_outdated
     ) then
    new.state_version := old.state_version + 1;
  end if;

  return new;
end
$versions$;

revoke all on function private.v3_bump_combined_aggregation_versions()
  from public, anon, authenticated;

drop trigger if exists v3_combined_aggregation_versions
  on televoting.televote_aggregations;
create trigger v3_combined_aggregation_versions
before update on televoting.televote_aggregations
for each row execute function private.v3_bump_combined_aggregation_versions();

create or replace function private.v3_touch_combined_configuration(
  p_aggregation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, televoting, private
as $touch$
begin
  if p_aggregation_id is null then
    return;
  end if;

  update televoting.televote_aggregations aggregation
  set
    config_version = aggregation.config_version + 1,
    results_outdated = case
      when aggregation.calculation_version > 0 then true
      else aggregation.results_outdated
    end
  where aggregation.id = p_aggregation_id;
end
$touch$;

revoke all on function private.v3_touch_combined_configuration(uuid)
  from public, anon, authenticated;

-- Preserve the legacy child-table invalidation trigger, but make every source,
-- participant and manual-value change advance the canonical config CAS even
-- before the first calculation exists.
create or replace function televoting.flag_aggregation_outdated()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $outdated$
declare
  v_new_agg uuid;
  v_old_agg uuid;
begin
  if tg_table_name = 'external_score_entries' then
    if tg_op <> 'DELETE' then
      select source.aggregation_id
      into v_new_agg
      from televoting.televote_aggregation_sources source
      where source.id = new.source_id;
    end if;
    if tg_op <> 'INSERT' then
      select source.aggregation_id
      into v_old_agg
      from televoting.televote_aggregation_sources source
      where source.id = old.source_id;
    end if;
  else
    if tg_op <> 'DELETE' then
      v_new_agg := new.aggregation_id;
    end if;
    if tg_op <> 'INSERT' then
      v_old_agg := old.aggregation_id;
    end if;
  end if;

  if v_new_agg is not null then
    perform private.v3_touch_combined_configuration(v_new_agg);
  end if;
  if v_old_agg is not null and v_old_agg is distinct from v_new_agg then
    perform private.v3_touch_combined_configuration(v_old_agg);
  end if;

  return coalesce(new, old);
end
$outdated$;

revoke all on function televoting.flag_aggregation_outdated()
  from public, anon, authenticated;

-- A compact exact-version read is useful for clients that need CAS without
-- reloading the full specialist workspace.
create or replace function public.v3_combined_result_versions(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $versions_read$
declare
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
begin
  perform private.v3_require_combined_results_read(p_edition_id);
  v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id);

  select aggregation.*
  into v_aggregation
  from televoting.televote_aggregations aggregation
  where aggregation.id = p_aggregation_id;

  if v_aggregation.id is null then
    raise exception 'Combined result not found' using errcode = 'P0002';
  end if;
  if v_remote_edition_id is null
     or v_aggregation.edition_id is distinct from v_remote_edition_id then
    raise exception 'Combined result is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'aggregationId', v_aggregation.id,
    'configVersion', v_aggregation.config_version,
    'stateVersion', v_aggregation.state_version,
    'calculationVersion', v_aggregation.calculation_version,
    'status', v_aggregation.status,
    'resultsOutdated', v_aggregation.results_outdated,
    'serverTime', now()
  );
end
$versions_read$;

revoke all on function public.v3_combined_result_versions(uuid, uuid)
  from public, anon;
grant execute on function public.v3_combined_result_versions(uuid, uuid)
  to authenticated, service_role;

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
      'supersessionOrReconciliationRequired',
        v_projection_present
        and v_action in ('configure', 'participants', 'source', 'values', 'recalculate', 'unlock'),
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

notify pgrst, 'reload schema';

commit;