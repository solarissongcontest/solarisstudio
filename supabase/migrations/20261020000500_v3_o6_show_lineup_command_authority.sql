begin;

-- V3 O6 / System authority for the Organizer show line-up workflow.
--
-- This migration does not replace the battle-tested atomic allocation and
-- running-order primitives. It wraps them in the canonical V3 operation
-- contract so retries, concurrent editors and workflow transitions are safe.
select public.v3_register_migration_contract(
  'v3.o6.show-lineup-command-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive V3 command authority for show line-up stage, allocation and running-order mutations with exact scope, CAS, semantic idempotency, receipts and domain events.'
);

create or replace function private.v3_show_lineup_snapshot(
  p_show_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $snapshot$
  with show_scope as (
    select
      s.id,
      s.edition_id,
      coalesce(s.lineup_stage, 'lineup')::text as lineup_stage
    from public.shows s
    where s.id = p_show_id
  ),
  participant_rows as (
    select
      p.id,
      p.show_id,
      p.country_id,
      p.contest_entity_id,
      p.running_order,
      p.running_order_allocation,
      p.updated_at
    from public.participants p
    where p.show_id = p_show_id
    order by p.id
  ),
  materialized as (
    select jsonb_build_object(
      'showId', scope.id,
      'editionId', scope.edition_id,
      'stage', scope.lineup_stage,
      'participants', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', row.id,
              'countryId', row.country_id,
              'contestEntityId', row.contest_entity_id,
              'runningOrder', row.running_order,
              'allocation', row.running_order_allocation,
              'updatedAt', row.updated_at
            )
            order by row.id
          )
          from participant_rows row
        ),
        '[]'::jsonb
      )
    ) as snapshot
    from show_scope scope
  )
  select case
    when materialized.snapshot is null then null
    else materialized.snapshot || jsonb_build_object(
      'stateVersion',
      encode(
        extensions.digest(
          convert_to(materialized.snapshot::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  end
  from materialized
$snapshot$;

revoke all on function private.v3_show_lineup_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_show_lineup_preflight(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  v_snapshot := private.v3_show_lineup_snapshot(p_show_id);
  if v_snapshot is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  v_edition_id := (v_snapshot ->> 'editionId')::uuid;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return v_snapshot || jsonb_build_object(
    'participantCount', jsonb_array_length(v_snapshot -> 'participants'),
    'allowedTransitions', case v_snapshot ->> 'stage'
      when 'lineup' then jsonb_build_array('allocation')
      when 'allocation' then jsonb_build_array('running_order')
      else '[]'::jsonb
    end
  );
end
$preflight$;

revoke all on function public.studio2_show_lineup_preflight(uuid)
  from public, anon;
grant execute on function public.studio2_show_lineup_preflight(uuid)
  to authenticated, service_role;

comment on function public.studio2_show_lineup_preflight(uuid) is
  'Canonical O6 show line-up preflight with exact edition/show scope and a deterministic CAS stateVersion.';

create or replace function private.v3_lock_show_lineup(
  p_show_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $lock$
begin
  perform 1
  from public.shows s
  where s.id = p_show_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  -- Lock the complete membership in stable order before computing CAS. This
  -- prevents a concurrent allocation/order command from validating against a
  -- snapshot that changes underneath it.
  perform 1
  from public.participants p
  where p.show_id = p_show_id
  order by p.id
  for update;
end
$lock$;

revoke all on function private.v3_lock_show_lineup(uuid)
  from public, anon, authenticated;

create or replace function private.v3_assert_show_lineup_version(
  p_show_id uuid,
  p_expected_state_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $assert_version$
declare
  v_snapshot jsonb;
  v_current text;
begin
  if nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_snapshot := private.v3_show_lineup_snapshot(p_show_id);
  if v_snapshot is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  v_current := v_snapshot ->> 'stateVersion';
  if v_current is distinct from p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_current
      )::text;
  end if;

  return v_snapshot;
end
$assert_version$;

revoke all on function private.v3_assert_show_lineup_version(uuid, text)
  from public, anon, authenticated;

create or replace function private.v3_emit_show_lineup_event(
  p_operation_id uuid,
  p_event_type text,
  p_show_id uuid,
  p_edition_id uuid,
  p_before_version text,
  p_after_version text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_aggregate_version bigint;
begin
  -- A positive deterministic 63-bit projection of the resulting state hash is
  -- sufficient for event identity while the full stateVersion remains in the
  -- payload/receipt for exact concurrency semantics.
  v_aggregate_version := hashtextextended(coalesce(p_after_version, ''), 0)
    & 9223372036854775807::bigint;

  return private.v3_emit_domain_event(
    p_event_type,
    'show',
    p_show_id::text,
    v_aggregate_version,
    p_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'beforeStateVersion', p_before_version,
      'afterStateVersion', p_after_version
    ) || coalesce(p_payload, '{}'::jsonb),
    1,
    array[]::text[]
  );
end
$emit$;

revoke all on function private.v3_emit_show_lineup_event(
  uuid, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.studio2_transition_show_lineup_stage(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_state_version text,
  p_target_stage text,
  p_initial_running_order uuid[] default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $transition$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_current_stage text;
  v_target_stage text := lower(btrim(coalesce(p_target_stage, '')));
  v_expected_count integer;
  v_supplied_count integer;
  v_distinct_count integer;
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_target_stage not in ('allocation', 'running_order') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.stage.transition',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedStateVersion', p_expected_state_version,
      'targetStage', v_target_stage,
      'initialRunningOrder', to_jsonb(p_initial_running_order)
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );
  v_current_stage := v_before ->> 'stage';

  if v_target_stage = 'allocation' then
    if v_current_stage <> 'lineup' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    update public.participants
    set running_order = null,
        running_order_allocation = null,
        updated_at = now()
    where show_id = p_show_id;

    update public.shows
    set lineup_stage = 'allocation',
        updated_at = now()
    where id = p_show_id;
  else
    if v_current_stage <> 'allocation' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    if exists (
      select 1
      from public.participants p
      where p.show_id = p_show_id
        and p.running_order_allocation is null
    ) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select count(*)::integer
      into v_expected_count
    from public.participants p
    where p.show_id = p_show_id;

    v_supplied_count := coalesce(array_length(p_initial_running_order, 1), 0);
    select count(distinct supplied)::integer
      into v_distinct_count
    from unnest(coalesce(p_initial_running_order, '{}'::uuid[])) supplied;

    if v_expected_count = 0
       or v_supplied_count <> v_expected_count
       or v_distinct_count <> v_expected_count
       or exists (
         select 1
         from unnest(coalesce(p_initial_running_order, '{}'::uuid[])) supplied(id)
         left join public.participants p
           on p.id = supplied.id
          and p.show_id = p_show_id
         where p.id is null
       ) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    perform public.admin_set_show_running_order(
      p_show_id,
      p_initial_running_order
    );

    update public.shows
    set lineup_stage = 'running_order',
        updated_at = now()
    where id = p_show_id;
  end if;

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.lineup_stage_changed',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'fromStage', v_current_stage,
      'toStage', v_target_stage,
      'participantCount', jsonb_array_length(v_after -> 'participants')
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'stage', v_target_stage,
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$transition$;

revoke all on function public.studio2_transition_show_lineup_stage(
  uuid, text, uuid, text, text, uuid[], uuid
) from public, anon;
grant execute on function public.studio2_transition_show_lineup_stage(
  uuid, text, uuid, text, text, uuid[], uuid
) to authenticated, service_role;

comment on function public.studio2_transition_show_lineup_stage(
  uuid, text, uuid, text, text, uuid[], uuid
) is
  'Canonical O6 line-up stage transition. Replays safely, rejects stale editors and atomically initializes allocation/running-order state.';

create or replace function public.studio2_save_show_allocations(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_state_version text,
  p_allocations jsonb,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save_allocations$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.allocation.save',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedStateVersion', p_expected_state_version,
      'allocations', p_allocations
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );
  if v_before ->> 'stage' <> 'allocation' then
    raise exception using errcode = '25000', message = 'STATE_CHANGED';
  end if;

  perform public.admin_set_show_allocations(p_show_id, p_allocations);

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.allocation_saved',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'participantCount', jsonb_array_length(v_after -> 'participants')
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'stage', 'allocation',
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$save_allocations$;

revoke all on function public.studio2_save_show_allocations(
  uuid, text, uuid, text, jsonb, uuid
) from public, anon;
grant execute on function public.studio2_save_show_allocations(
  uuid, text, uuid, text, jsonb, uuid
) to authenticated, service_role;

comment on function public.studio2_save_show_allocations(
  uuid, text, uuid, text, jsonb, uuid
) is
  'Canonical O6 atomic allocation save with exact show scope, CAS, semantic idempotency, receipt and domain event.';

create or replace function public.studio2_save_show_running_order(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_state_version text,
  p_participant_ids uuid[],
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save_order$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.running_order.save',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedStateVersion', p_expected_state_version,
      'participantIds', to_jsonb(p_participant_ids)
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );
  if v_before ->> 'stage' <> 'running_order' then
    raise exception using errcode = '25000', message = 'STATE_CHANGED';
  end if;

  perform public.admin_set_show_running_order(p_show_id, p_participant_ids);

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.running_order_saved',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'participantCount', jsonb_array_length(v_after -> 'participants')
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'stage', 'running_order',
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$save_order$;

revoke all on function public.studio2_save_show_running_order(
  uuid, text, uuid, text, uuid[], uuid
) from public, anon;
grant execute on function public.studio2_save_show_running_order(
  uuid, text, uuid, text, uuid[], uuid
) to authenticated, service_role;

comment on function public.studio2_save_show_running_order(
  uuid, text, uuid, text, uuid[], uuid
) is
  'Canonical O6 atomic running-order save with exact show scope, CAS, semantic idempotency, receipt and domain event.';

notify pgrst, 'reload schema';

commit;
