begin;

select public.v3_register_migration_contract(
  'v3.results.combined-participant-reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'Add canonical exact-edition Combined participant reconciliation with bounded batch CAS behavior while preserving the legacy invalidation bridge during cutover.'
);

-- System V3 / #927: participant snapshots are derived from the exact bound
-- Solaris show. Batch replacement suppresses per-row config-version churn and
-- advances the canonical configuration CAS exactly once per logical command.

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
  if coalesce(current_setting('solaris.v3_combined_config_batch', true), '') = '1' then
    return coalesce(new, old);
  end if;

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

create or replace function public.v3_reconcile_combined_result_participants(
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
as $reconcile$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_remote_edition_id uuid;
  v_aggregation televoting.televote_aggregations%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_preflight jsonb;
  v_detail jsonb;
  v_show_id uuid;
  v_expected_codes text[] := '{}'::text[];
  v_actual_codes text[] := '{}'::text[];
  v_expected_count integer := 0;
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

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'voting.configure',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'aggregationId', p_aggregation_id,
      'subjectType', 'combined_result_participants'
    ),
    jsonb_build_object(
      'aggregationId', p_aggregation_id,
      'mode', 'canonical_show_snapshot',
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
    'participants'
  );
  if coalesce((v_preflight ->> 'canCommit')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = coalesce((v_preflight -> 'blockers')::text, '[]');
  end if;

  v_detail := public.v3_combined_result_detail(p_edition_id, p_aggregation_id);
  if (v_detail -> 'participantBinding' ->> 'state') not in ('up_to_date', 'drift') then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = 'Combined participant reconciliation requires exactly one bound Solaris show.';
  end if;

  v_show_id := nullif(v_detail -> 'participantBinding' ->> 'showId', '')::uuid;
  if v_show_id is null then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
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
  into v_expected_count, v_expected_codes
  from public.participants participant
  left join public.countries country on country.id = participant.country_id
  where participant.show_id = v_show_id
    and participant.country_id is not null
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  if v_expected_count < 1 or cardinality(v_expected_codes) <> v_expected_count then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      detail = 'Canonical show participants must all resolve to a country code.';
  end if;

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

  v_changed := v_actual_codes is distinct from v_expected_codes;

  if v_changed then
    perform set_config('solaris.v3_combined_config_batch', '1', true);

    delete from televoting.televote_aggregation_participants participant
    where participant.aggregation_id = p_aggregation_id;

    insert into televoting.televote_aggregation_participants (
      aggregation_id,
      country_code,
      display_order
    )
    select
      p_aggregation_id,
      code,
      ordinality - 1
    from unnest(v_expected_codes) with ordinality as expected(code, ordinality);

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
    )
    values (
      auth.uid(),
      coalesce(
        auth.jwt() ->> 'email',
        auth.jwt() -> 'user_metadata' ->> 'display_name',
        auth.uid()::text
      ),
      'reconcile_combined_participants',
      'televote_aggregation',
      p_aggregation_id::text,
      jsonb_build_object('participantCount', cardinality(v_actual_codes)),
      jsonb_build_object(
        'participantCount', v_expected_count,
        'source', 'canonical_solaris_show',
        'showId', v_show_id
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
      v_show_id,
      jsonb_build_object(
        'aggregationId', p_aggregation_id,
        'change', 'participant_snapshot_reconciled',
        'participantCount', v_expected_count,
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
    'showId', v_show_id,
    'participantCount', v_expected_count,
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
$reconcile$;

revoke all on function public.v3_reconcile_combined_result_participants(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) from public, anon;
grant execute on function public.v3_reconcile_combined_result_participants(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) to authenticated, service_role;

comment on function public.v3_reconcile_combined_result_participants(
  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text
) is
  'Canonical exact-edition Combined participant reconciliation from one bound Solaris show, with bounded batch mutation, S2 replay and three-way CAS.';

notify pgrst, 'reload schema';

commit;