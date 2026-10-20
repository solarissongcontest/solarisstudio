begin;

-- System V3 S9/S10 forward fix: harden workflow observability after exact-head
-- review found three correctness gaps in the first aggregate projection:
--
-- 1. Jury window commands were classified as jury submissions instead of voting
--    transitions.
-- 2. S2 created_at/completed_at can both use transaction-stable now(), producing
--    artificial zero-duration command latency for synchronous RPCs.
-- 3. Reconciliation pressure was incorrectly bounded by the reporting lookback,
--    allowing old processing/uncertain operations to disappear from the backlog.
--
-- This migration keeps the canonical S2 receipt ledger. It does not add another
-- telemetry store. A BEFORE UPDATE trigger stamps terminal receipt transitions
-- with clock_timestamp(), while the projection excludes legacy equal-timestamp
-- rows from latency percentiles rather than pretending zero is measured latency.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.workflow-observability-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Correct workflow classification, wall-clock operation latency evidence, and lookback-independent reconciliation pressure.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_stamp_operation_receipt_wallclock_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $stamp$
begin
  if old.status = 'processing'
     and new.status in ('succeeded', 'failed', 'uncertain')
     and old.status is distinct from new.status then
    -- S2 historically writes completed_at = now(). PostgreSQL now() is fixed at
    -- transaction start, so override the terminal transition with advancing wall
    -- clock time. created_at remains the transaction-start boundary, which makes
    -- this a conservative end-to-end database command duration.
    new.completed_at := clock_timestamp();
    new.updated_at := new.completed_at;
  end if;

  return new;
end
$stamp$;

revoke all on function private.v3_stamp_operation_receipt_wallclock_completion()
  from public, anon, authenticated;

drop trigger if exists v3_stamp_operation_receipt_wallclock_completion
  on public.studio2_operation_receipts;
create trigger v3_stamp_operation_receipt_wallclock_completion
before update of status on public.studio2_operation_receipts
for each row
when (
  old.status = 'processing'
  and old.status is distinct from new.status
  and new.status in ('succeeded', 'failed', 'uncertain')
)
execute function private.v3_stamp_operation_receipt_wallclock_completion();

-- Keep current unresolved pressure cheap even after the durable operation ledger
-- becomes large. The partial index contains only work that can still require
-- reconciliation and does not change operation authority.
create index if not exists studio2_operation_receipts_unresolved_status_command_idx
  on public.studio2_operation_receipts (status, command)
  where status in ('processing', 'uncertain');

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
      or p_command like 'jury.window.%'
      or p_command like 'televote.window.%'
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

revoke all on function private.v3_observability_workflow_class(text)
  from public, anon, authenticated;
grant execute on function private.v3_observability_workflow_class(text)
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
      count(operation.operation_id) filter (
        where operation.status in ('succeeded', 'failed', 'uncertain')
          and operation.completed_at is not null
          and operation.completed_at > operation.created_at
      ) as operation_latency_samples,
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
      round((
        percentile_cont(0.50) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
            and operation.completed_at > operation.created_at
        )
      ))::bigint as p50_operation_latency_ms,
      round((
        percentile_cont(0.95) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
            and operation.completed_at > operation.created_at
        )
      ))::bigint as p95_operation_latency_ms,
      round((
        percentile_cont(0.99) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
            and operation.completed_at > operation.created_at
        )
      ))::bigint as p99_operation_latency_ms
    from workflow_classes workflow
    left join classified_operations operation
      on operation.workflow_class = workflow.workflow_class
    group by workflow.workflow_class
  ),
  current_reconciliation_metrics as (
    select
      workflow.workflow_class,
      count(receipt.operation_id) filter (
        where receipt.status in ('processing', 'uncertain')
      ) as reconciliation_pending_operations
    from workflow_classes workflow
    left join public.studio2_operation_receipts receipt
      on private.v3_observability_workflow_class(receipt.command) = workflow.workflow_class
     and receipt.status in ('processing', 'uncertain')
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
            and delivery.completed_at >= event_row.occurred_at
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
        'reconciliationPendingOperations', reconciliation.reconciliation_pending_operations,
        'successRatio', operation.success_ratio,
        'operationLatencySamples', operation.operation_latency_samples,
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
  join current_reconciliation_metrics reconciliation
    on reconciliation.workflow_class = operation.workflow_class
  join consequence_metrics consequence
    on consequence.workflow_class = operation.workflow_class;

  return jsonb_build_object(
    'schemaVersion', 2,
    'generatedAt', now(),
    'windowMinutes', p_lookback_minutes,
    'windowStart', v_since,
    'classification', 'fixed_low_cardinality',
    'latencySemantics', 'wall_clock_terminal_transition',
    'reconciliationSemantics', 'current_unresolved_not_windowed',
    'classes', v_classes
  );
end
$workflow_snapshot$;

revoke all on function public.admin_system_workflow_observability_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_workflow_observability_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_workflow_observability_snapshot(integer) is
  'S9 bounded low-cardinality workflow metrics. Outcome/latency cohorts use the requested lookback; current reconciliation pressure includes all still-unresolved operations. Latency excludes legacy transaction-stable equal timestamps.';

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
    when v_operation.completed_at is null
      or v_operation.completed_at <= v_operation.created_at then null
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
    'schemaVersion', 3,
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
      'timingMeasured', v_duration_ms is not null,
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
  'S9 exact privacy-safe operation trace. Duration is emitted only when wall-clock-valid terminal timing evidence exists; legacy equal transaction timestamps remain unknown rather than fake zero.';

notify pgrst, 'reload schema';

commit;
