begin;

-- System V3 / S6 + Organizer O3: expose operational Task state from canonical
-- server evidence. The legacy task table keeps its compatibility state
-- (open/waiting/resolved); this projection adds the richer V3 vocabulary
-- without creating a second writable source of truth.
select public.v3_register_migration_contract(
  'v3.s6.organizer-task-operational-state',
  1,
  'forward_fix_only',
  false,
  null,
  'Project blocked, failed, overdue and actionable Organizer task states from canonical task producer evidence while preserving the legacy persisted state contract.'
);

create or replace function private.v3_organizer_task_operational_state(
  p_state text,
  p_source_kind text,
  p_task_type text,
  p_due_at timestamptz,
  p_resolution_predicate jsonb,
  p_evaluated_at timestamptz default now()
)
returns text
language sql
stable
set search_path = pg_catalog, public, private
as $state$
  select case
    when p_state = 'resolved' then 'resolved'
    when p_state = 'waiting' then 'waiting'

    -- A canonical task producer may explicitly publish operational state in its
    -- server-authored resolution predicate. Never accept "resolved" here:
    -- resolution remains owned by the persisted canonical task state.
    when coalesce(p_resolution_predicate, '{}'::jsonb) ->> 'operationalState'
      in ('actionable', 'blocked', 'waiting', 'failed', 'overdue')
      then coalesce(p_resolution_predicate, '{}'::jsonb) ->> 'operationalState'

    -- These source objects only exist while an authoritative failure condition
    -- is current. Their producer/reconciler clears the Task when that condition
    -- recovers, so the projection does not infer failure from title or priority.
    when p_task_type in (
      'notification.delivery_failed',
      'integration.operation.failed',
      'integration.link.repair',
      'system.job.failure'
    ) or p_source_kind in (
      'notification_delivery',
      'integration_failure',
      'integration_link_error',
      'system_job'
    ) then 'failed'

    -- Required-media faults are emitted only for missing or explicitly invalid
    -- canonical required slots. Processing media is deliberately excluded by
    -- the producer, making this a blocking condition rather than severity guess.
    when p_task_type = 'media.required'
      or p_source_kind = 'media_required_fault'
      then 'blocked'

    when p_due_at is not null and p_due_at <= p_evaluated_at then 'overdue'
    else 'actionable'
  end;
$state$;

revoke all on function private.v3_organizer_task_operational_state(
  text, text, text, timestamptz, jsonb, timestamptz
) from public, anon, authenticated;

create or replace function public.admin_organizer_tasks(
  p_edition_id uuid default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_actor uuid := auth.uid();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_evaluated_at timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_filter not in (
    'all',
    'mine',
    'actionable',
    'blocked',
    'waiting',
    'failed',
    'overdue',
    'resolved'
  ) then
    raise exception 'Unknown task filter: %', v_filter using errcode = '22023';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  if p_edition_id is null
     and not public.studio2_access_allowed('edition.read', null, false)
     and not public.studio2_access_allowed('integrity.read', null, false)
     and not public.studio2_access_allowed('incident.read', null, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  return coalesce((
    with scoped as (
      select
        task.*,
        private.v3_organizer_task_operational_state(
          task.state,
          task.source_kind,
          task.task_type,
          task.due_at,
          task.resolution_predicate,
          v_evaluated_at
        ) as operational_state
      from public.studio2_organizer_tasks task
      where (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
        and public.studio2_access_allowed(task.required_capability, task.edition_id, false)
        and (
          task.source_kind not in ('permission_approval', 'permission_approval_apply')
          or task.assigned_to = v_actor
        )
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', task.id,
        'editionId', task.edition_id,
        'countryId', task.country_id,
        'assignedTo', task.assigned_to,
        'sourceKind', task.source_kind,
        'sourceKey', task.source_key,
        'dedupeKey', task.source_key,
        'taskType', task.task_type,
        'priority', task.priority,
        'state', task.state,
        'operationalState', task.operational_state,
        'title', task.title,
        'description', task.description,
        'href', task.href,
        'dueAt', task.due_at,
        'resolutionPredicate', task.resolution_predicate,
        'ruleReference', task.rule_reference,
        'openedAt', task.opened_at,
        'resolvedAt', task.resolved_at,
        'lastEvaluatedAt', task.last_evaluated_at,
        'stateVersion', task.updated_at
      )
      order by
        case task.priority when 'critical' then 1 when 'high' then 2 else 3 end,
        task.due_at asc nulls last,
        task.opened_at desc
    )
    from scoped task
    where (
      (v_filter = 'all' and task.operational_state <> 'resolved')
      or (
        v_filter = 'mine'
        and task.operational_state <> 'resolved'
        and task.assigned_to = v_actor
      )
      or (
        v_filter in ('actionable', 'blocked', 'waiting', 'failed', 'overdue', 'resolved')
        and task.operational_state = v_filter
      )
    )
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.admin_organizer_tasks(uuid, text)
  from public, anon;
grant execute on function public.admin_organizer_tasks(uuid, text)
  to authenticated, service_role;

-- Publish feature support through the existing additive runtime contract. Old
-- clients ignore the extra capability; new consumers can distinguish an empty
-- queue from an older backend that cannot classify blocked/failed Tasks.
create or replace function public.studio2_runtime_contract()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $contract$
  with capability as (
    select
      (
        to_regprocedure('public.admin_organizer_tasks(uuid,text)') is not null
        and to_regprocedure('public.admin_organizer_task_count(uuid)') is not null
        and to_regclass('public.studio2_organizer_tasks') is not null
        and to_regprocedure(
          'private.studio2_reconcile_all_organizer_tasks(uuid)'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_system_job_tasks()'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_jury_ballot_review_tasks(uuid)'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_confirmation_sync_tasks()'
        ) is not null
      ) as organizer_tasks,
      (
        to_regprocedure(
          'private.v3_organizer_task_operational_state(text,text,text,timestamp with time zone,jsonb,timestamp with time zone)'
        ) is not null
      ) as organizer_task_operational_states,
      (
        to_regprocedure('public.admin_system_runtime_health(integer)') is not null
        and to_regprocedure(
          'public.admin_retry_failed_notification_delivery(uuid,uuid,text)'
        ) is not null
        and to_regclass('public.notification_deliveries') is not null
        and (
          select count(*)
          from information_schema.columns column_info
          where column_info.table_schema = 'public'
            and column_info.table_name = 'notification_deliveries'
            and column_info.column_name in (
              'provider_accepted_at',
              'received_at',
              'displayed_at',
              'receipt_token_hash'
            )
        ) = 4
      ) as system_operations,
      (
        to_regprocedure(
          'public.studio2_jury_window_change_preview(uuid,text)'
        ) is not null
        and to_regprocedure(
          'public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)'
        ) is not null
        and to_regclass('public.studio2_jury_window_versions') is not null
      ) as jury_window_operations
  )
  select jsonb_build_object(
    'schemaId', 'organisation-os-v5-20261004-complete',
    'ready',
      capability.organizer_tasks
      and capability.system_operations
      and capability.jury_window_operations,
    'capabilities', jsonb_build_object(
      'organizerTasks', capability.organizer_tasks,
      'organizerTaskOperationalStates', capability.organizer_task_operational_states,
      'systemOperations', capability.system_operations,
      'juryWindowOperations', capability.jury_window_operations
    )
  )
  from capability;
$contract$;

revoke all on function public.studio2_runtime_contract()
  from public, anon;
grant execute on function public.studio2_runtime_contract()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
