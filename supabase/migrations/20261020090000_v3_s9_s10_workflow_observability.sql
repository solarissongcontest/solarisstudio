begin;

-- System V3 S9/S10: close two remaining reliability evidence gaps without
-- creating another telemetry ledger. The workflow projection reads the
-- canonical S2 operation receipts + S4 event/outbox ledgers through one bounded,
-- low-cardinality System-owned contract; S10 consumes that projection.
--
-- The same forward fix also normalizes the per-operation diagnostic trace so
-- system.read operators keep exact operation/correlation linkage without
-- receiving actor identity, raw semantic scope, aggregate object identifiers or
-- raw error metadata.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.workflow-observability-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive privacy-safe S9 workflow metrics and S10 consumption; forward-fix the diagnostic trace contract if later operational evidence requires refinement.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_observability_workflow_class(
  p_command text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $workflow$
  select case
    when p_command = 'confirmation.submit'
      or p_command like 'confirmation.submit.%'
      then 'confirmation_submission'
    when p_command like 'entry.%'
      then 'entry_mutation'
    when p_command like 'media.%'
      then 'media_review_consequence'
    when p_command in ('jury.open', 'jury.close', 'televote.open', 'televote.close')
      or p_command like 'jury.round.%'
      or p_command like 'televote.round.%'
      or p_command like 'voting.%'
      then 'voting_round_transition'
    when p_command like 'jury.%'
      then 'jury_submission'
    when p_command = 'televote.submit'
      or p_command like 'televote.submit.%'
      then 'televote_submission'
    when p_command like 'results.%'
      or p_command like 'result.%'
      then 'results_lifecycle'
    when p_command like 'publication.%'
      then 'publication'
    when p_command like 'notification.%'
      or p_command like 'notice.delivery.%'
      then 'notification_consequence'
    when p_command like 'projection.%'
      or p_command like 'reconciliation.%'
      or p_command like 'reconcile.%'
      or p_command like 'system.reconcile%'
      then 'projection_reconciliation'
    else null
  end
$workflow$;

create or replace function private.v3_observability_failure_class(
  p_error_code text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $failure$
  select case upper(coalesce(p_error_code, ''))
    when '' then null
    when 'AUTHENTICATION' then 'authentication_failure'
    when 'AUTHORIZATION' then 'authorization_failure'
    when 'VALIDATION' then 'validation_failure'
    when 'STATE_CHANGED' then 'conflict_or_stale_state'
    when 'VERSION_CONFLICT' then 'conflict_or_stale_state'
    when 'IDEMPOTENCY_CONFLICT' then 'conflict_or_stale_state'
    when 'DEPENDENCY_FAILURE' then 'dependency_failure'
    when 'RATE_LIMIT' then 'transient_infrastructure_failure'
    when 'DATABASE' then 'transient_infrastructure_failure'
    when 'STORAGE' then 'transient_infrastructure_failure'
    when 'TIMEOUT' then 'transient_infrastructure_failure'
    else 'unknown_failure'
  end
$failure$;

revoke all on function private.v3_observability_workflow_class(text)
  from public, anon, authenticated;
revoke all on function private.v3_observability_failure_class(text)
  from public, anon, authenticated;
grant execute on function private.v3_observability_workflow_class(text)
  to service_role;
grant execute on function private.v3_observability_failure_class(text)
  to service_role;

create or replace function public.admin_system_workflow_observability_snapshot(
  p_lookback_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $workflow_snapshot$
declare
  v_since timestamptz;
  v_classes jsonb := '[]'::jsonb;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if p_lookback_minutes is null or p_lookback_minutes not between 5 and 10080 then
    raise exception 'Workflow observability lookback must be between 5 minutes and 7 days'
      using errcode = '22023';
  end if;

  v_since := now() - make_interval(mins => p_lookback_minutes);

  with workflow_classes(workflow_class) as (
    values
      ('confirmation_submission'::text),
      ('entry_mutation'::text),
      ('media_review_consequence'::text),
      ('jury_submission'::text),
      ('televote_submission'::text),
      ('voting_round_transition'::text),
      ('results_lifecycle'::text),
      ('publication'::text),
      ('notification_consequence'::text),
      ('projection_reconciliation'::text)
  ),
  classified_operations as (
    select
      receipt.operation_id,
      private.v3_observability_workflow_class(receipt.command) as workflow_class,
      receipt.status,
      receipt.created_at,
      receipt.completed_at
    from public.studio2_operation_receipts receipt
    where receipt.created_at >= v_since
      and private.v3_observability_workflow_class(receipt.command) is not null
  ),
  operation_metrics as (
    select
      workflow.workflow_class,
      count(operation.operation_id) as total_operations,
      count(operation.operation_id) filter (
        where operation.status in ('succeeded', 'failed', 'uncertain')
      ) as completed_operations,
      count(operation.operation_id) filter (where operation.status = 'succeeded') as succeeded_operations,
      count(operation.operation_id) filter (where operation.status = 'failed') as failed_operations,
      count(operation.operation_id) filter (where operation.status = 'uncertain') as uncertain_operations,
      count(operation.operation_id) filter (where operation.status = 'processing') as processing_operations,
      case
        when count(operation.operation_id) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
        ) = 0 then null
        else round(
          (count(operation.operation_id) filter (where operation.status = 'succeeded'))::numeric
          / (count(operation.operation_id) filter (
              where operation.status in ('succeeded', 'failed', 'uncertain')
            ))::numeric,
          4
        )
      end as success_ratio,
      coalesce(round((
        percentile_cont(0.50) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
        )
      ))::bigint, 0) as p50_operation_latency_ms,
      coalesce(round((
        percentile_cont(0.95) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
        )
      ))::bigint, 0) as p95_operation_latency_ms,
      coalesce(round((
        percentile_cont(0.99) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
        )
      ))::bigint, 0) as p99_operation_latency_ms
    from workflow_classes workflow
    left join classified_operations operation
      on operation.workflow_class = workflow.workflow_class
    group by workflow.workflow_class
  ),
  consequence_metrics as (
    select
      workflow.workflow_class,
      count(delivery.event_id) as consequence_count,
      count(delivery.event_id) filter (
        where delivery.status = 'completed' and delivery.completed_at is not null
      ) as completed_consequence_count,
      count(delivery.event_id) filter (
        where delivery.status in ('pending', 'processing', 'dead_letter')
      ) as unresolved_consequence_count,
      coalesce(round((
        percentile_cont(0.95) within group (
          order by extract(epoch from (delivery.completed_at - event_row.occurred_at)) * 1000
        ) filter (
          where delivery.status = 'completed'
            and delivery.completed_at is not null
        )
      ))::bigint, 0) as p95_consequence_lag_ms
    from workflow_classes workflow
    left join classified_operations operation
      on operation.workflow_class = workflow.workflow_class
    left join private.v3_domain_events event_row
      on event_row.operation_id = operation.operation_id
    left join private.v3_domain_event_outbox delivery
      on delivery.event_id = event_row.id
    group by workflow.workflow_class
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'scope', operation.workflow_class,
        'totalOperations', operation.total_operations,
        'completedOperations', operation.completed_operations,
        'succeededOperations', operation.succeeded_operations,
        'failedOperations', operation.failed_operations,
        'uncertainOperations', operation.uncertain_operations,
        'processingOperations', operation.processing_operations,
        'reconciliationPendingOperations', operation.uncertain_operations + operation.processing_operations,
        'successRatio', operation.success_ratio,
        'p50OperationLatencyMs', operation.p50_operation_latency_ms,
        'p95OperationLatencyMs', operation.p95_operation_latency_ms,
        'p99OperationLatencyMs', operation.p99_operation_latency_ms,
        'consequenceCount', consequence.consequence_count,
        'completedConsequenceCount', consequence.completed_consequence_count,
        'unresolvedConsequenceCount', consequence.unresolved_consequence_count,
        'p95ConsequenceLagMs', consequence.p95_consequence_lag_ms
      )
      order by operation.workflow_class
    ),
    '[]'::jsonb
  )
  into v_classes
  from operation_metrics operation
  join consequence_metrics consequence
    on consequence.workflow_class = operation.workflow_class;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'windowMinutes', p_lookback_minutes,
    'windowStart', v_since,
    'classification', 'fixed_low_cardinality',
    'classes', v_classes
  );
end
$workflow_snapshot$;

revoke all on function public.admin_system_workflow_observability_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_workflow_observability_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_workflow_observability_snapshot(integer) is
  'S9 bounded low-cardinality workflow operation/consequence metrics. Returns only fixed scope labels, aggregate counts and timing; requires system.read.';

create or replace function public.admin_system_operation_trace(
  p_operation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $trace$
declare
  v_operation public.studio2_operation_receipts%rowtype;
  v_events jsonb := '[]'::jsonb;
  v_workflow_class text;
  v_failure_class text;
  v_reconciliation_state text;
  v_duration_ms bigint;
  v_age_ms bigint;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if p_operation_id is null then
    raise exception 'Operation id is required' using errcode = '22023';
  end if;

  select receipt.*
  into v_operation
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id;

  if v_operation.operation_id is null then
    raise exception 'Operation not found' using errcode = 'P0002';
  end if;

  v_workflow_class := private.v3_observability_workflow_class(v_operation.command);
  v_failure_class := private.v3_observability_failure_class(v_operation.error_code);
  v_reconciliation_state := case v_operation.status
    when 'uncertain' then 'required'
    when 'processing' then 'pending'
    else 'settled'
  end;
  v_duration_ms := case
    when v_operation.completed_at is null then null
    else round(extract(epoch from (v_operation.completed_at - v_operation.created_at)) * 1000)::bigint
  end;
  v_age_ms := round(extract(epoch from (now() - v_operation.created_at)) * 1000)::bigint;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'eventId', event_row.id,
        'eventType', event_row.event_type,
        'aggregateType', event_row.aggregate_type,
        'aggregateVersion', event_row.aggregate_version,
        'occurredAt', event_row.occurred_at,
        'schemaVersion', event_row.schema_version,
        'deliveries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'consumerKey', delivery.consumer_key,
              'status', delivery.status,
              'attemptCount', delivery.attempt_count,
              'availableAt', delivery.available_at,
              'leaseExpiresAt', delivery.lease_expires_at,
              'failureClass', private.v3_observability_failure_class(delivery.last_error_code),
              'completedAt', delivery.completed_at,
              'deadLetteredAt', delivery.dead_lettered_at,
              'receiptCompletedAt', consumer_receipt.completed_at
            )
            order by delivery.consumer_key
          )
          from private.v3_domain_event_outbox delivery
          left join private.v3_domain_event_consumer_receipts consumer_receipt
            on consumer_receipt.event_id = delivery.event_id
           and consumer_receipt.consumer_key = delivery.consumer_key
          where delivery.event_id = event_row.id
        ), '[]'::jsonb)
      )
      order by event_row.occurred_at, event_row.id
    ),
    '[]'::jsonb
  )
  into v_events
  from private.v3_domain_events event_row
  where event_row.operation_id = p_operation_id;

  return jsonb_build_object(
    'schemaVersion', 2,
    'generatedAt', now(),
    'operation', jsonb_build_object(
      'operationId', v_operation.operation_id,
      'correlationId', v_operation.correlation_id,
      'command', v_operation.command,
      'domain', split_part(v_operation.command, '.', 1),
      'workflowClass', v_workflow_class,
      'riskClass', v_operation.risk_class,
      'status', v_operation.status,
      'failureClass', v_failure_class,
      'reconciliationState', v_reconciliation_state,
      'createdAt', v_operation.created_at,
      'completedAt', v_operation.completed_at,
      'durationMs', v_duration_ms,
      'ageMs', v_age_ms
    ),
    'events', v_events,
    'summary', jsonb_build_object(
      'eventCount', jsonb_array_length(v_events),
      'pendingDeliveries', (
        select count(*)
        from private.v3_domain_event_outbox delivery
        join private.v3_domain_events event_row on event_row.id = delivery.event_id
        where event_row.operation_id = p_operation_id
          and delivery.status = 'pending'
      ),
      'processingDeliveries', (
        select count(*)
        from private.v3_domain_event_outbox delivery
        join private.v3_domain_events event_row on event_row.id = delivery.event_id
        where event_row.operation_id = p_operation_id
          and delivery.status = 'processing'
      ),
      'completedDeliveries', (
        select count(*)
        from private.v3_domain_event_outbox delivery
        join private.v3_domain_events event_row on event_row.id = delivery.event_id
        where event_row.operation_id = p_operation_id
          and delivery.status = 'completed'
      ),
      'deadLetterDeliveries', (
        select count(*)
        from private.v3_domain_event_outbox delivery
        join private.v3_domain_events event_row on event_row.id = delivery.event_id
        where event_row.operation_id = p_operation_id
          and delivery.status = 'dead_letter'
      )
    )
  );
end
$trace$;

revoke all on function public.admin_system_operation_trace(uuid)
  from public, anon;
grant execute on function public.admin_system_operation_trace(uuid)
  to authenticated, service_role;

comment on function public.admin_system_operation_trace(uuid) is
  'S9 exact operation diagnostic trace. Requires system.read; omits actor identity, raw semantic scope/object identifiers and raw error metadata while preserving operation/correlation linkage.';

create or replace function public.admin_system_v3_sli_snapshot(
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $sli$
declare
  v_window integer := coalesce(p_window_minutes, 60);
  v_observability jsonb;
  v_workflow_observability jsonb;
  v_operations jsonb;
  v_events jsonb;
  v_deliveries jsonb;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if v_window not between 5 and 10080 then
    raise exception 'SLI window must be between 5 and 10080 minutes'
      using errcode = '22023';
  end if;

  -- S9 owns both bounded query paths. S10 only maps the safe projections to SLI
  -- vocabulary; it does not filter raw ledgers by workflow in browser/TypeScript.
  v_observability := public.admin_system_observability_snapshot(v_window);
  v_workflow_observability := public.admin_system_workflow_observability_snapshot(v_window);
  v_operations := coalesce(v_observability -> 'operations', '{}'::jsonb);
  v_events := coalesce(v_observability -> 'events', '{}'::jsonb);
  v_deliveries := coalesce(v_observability -> 'deliveries', '{}'::jsonb);

  return jsonb_build_object(
    'schemaVersion', 3,
    'generatedAt', v_observability -> 'generatedAt',
    'windowMinutes', coalesce((v_observability ->> 'windowMinutes')::integer, v_window),
    'windowStart', v_observability -> 'windowStart',
    'source', jsonb_build_object(
      'projection', 'admin_system_observability_snapshot',
      'workflowProjection', 'admin_system_workflow_observability_snapshot',
      'schemaVersion', v_observability -> 'schemaVersion',
      'workflowSchemaVersion', v_workflow_observability -> 'schemaVersion'
    ),
    'coverage', jsonb_build_object(
      'state', 'workflow_measured',
      'measured', jsonb_build_array(
        'operation_outcomes',
        'domain_event_volume',
        'consequence_queue_state',
        'consequence_completion_lag',
        'authoritative_submission_latency',
        'workflow_operation_latency',
        'workflow_consequence_lag',
        'workflow_reconciliation_pressure'
      ),
      'remaining', jsonb_build_array(
        'core_read_availability',
        'projection_freshness_by_projection'
      )
    ),
    'operations', jsonb_build_object(
      'total', coalesce((v_operations ->> 'total')::bigint, 0),
      'completed', coalesce((v_operations ->> 'completed')::bigint, 0),
      'succeeded', coalesce((v_operations ->> 'succeeded')::bigint, 0),
      'failed', coalesce((v_operations ->> 'failed')::bigint, 0),
      'uncertain', coalesce((v_operations ->> 'uncertain')::bigint, 0),
      'processing', coalesce((v_operations ->> 'processing')::bigint, 0),
      'successRatio', case
        when v_operations -> 'successRate' = 'null'::jsonb then null
        else v_operations -> 'successRate'
      end,
      'oldestProcessingAgeSeconds', coalesce(
        (v_operations ->> 'oldestProcessingAgeSeconds')::bigint,
        0
      )
    ),
    'workflows', coalesce(v_workflow_observability -> 'classes', '[]'::jsonb),
    'domainEvents', jsonb_build_object(
      'emitted', coalesce((v_events ->> 'total')::bigint, 0),
      'correlations', coalesce((v_events ->> 'correlations')::bigint, 0)
    ),
    'consequences', jsonb_build_object(
      'total', coalesce((v_deliveries ->> 'total')::bigint, 0),
      'pending', coalesce((v_deliveries ->> 'pending')::bigint, 0),
      'actionablePending', coalesce((v_deliveries ->> 'actionablePending')::bigint, 0),
      'deferredPending', coalesce((v_deliveries ->> 'deferredPending')::bigint, 0),
      'processing', coalesce((v_deliveries ->> 'processing')::bigint, 0),
      'activeProcessing', coalesce((v_deliveries ->> 'activeProcessing')::bigint, 0),
      'completed', coalesce((v_deliveries ->> 'completed')::bigint, 0),
      'deadLetter', coalesce((v_deliveries ->> 'deadLetter')::bigint, 0),
      'retried', coalesce((v_deliveries ->> 'retrying')::bigint, 0),
      'attempts', coalesce((v_deliveries ->> 'totalAttempts')::bigint, 0),
      'expiredProcessingLeases', coalesce(
        (v_deliveries ->> 'expiredProcessingLeases')::bigint,
        0
      ),
      'averageCompletedLagMs', coalesce(
        (v_deliveries ->> 'averageCompletedLagMs')::bigint,
        0
      ),
      'p95CompletedLagMs', coalesce(
        (v_deliveries ->> 'p95CompletedLagMs')::bigint,
        0
      ),
      'maxCompletedLagMs', coalesce(
        (v_deliveries ->> 'maxCompletedLagMs')::bigint,
        0
      ),
      'oldestActionableAgeSeconds', coalesce(
        (v_deliveries ->> 'oldestActionableAgeSeconds')::bigint,
        0
      )
    ),
    'targets', null,
    'errorBudgets', null,
    'alerts', null
  );
end
$sli$;

revoke all on function public.admin_system_v3_sli_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_v3_sli_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_v3_sli_snapshot(integer) is
  'S10 measured SLI snapshot derived exclusively from bounded privacy-safe S9 aggregate projections. Workflow classes are fixed/low-cardinality; targets remain unset until reviewed evidence exists.';

notify pgrst, 'reload schema';

commit;
