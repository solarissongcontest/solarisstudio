begin;

-- System V3 S9/S10 review hardening.
--
-- Forward-fix four observability defects without rewriting historical receipts:
-- 1. jury.window.* is an operational voting transition, not a jury submission;
-- 2. new receipt timestamps use wall-clock time so synchronous command latency is
--    measurable even when claim + completion occur in one PostgreSQL transaction;
-- 3. reconciliation pressure is current unresolved state, independent of the
--    selected completed-operation lookback window;
-- 4. the bounded workflow projection retains the existing low-cardinality output.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.workflow-observability-review-fix-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Correct workflow classification, wall-clock operation timing and current reconciliation-backlog evidence without rewriting historical receipt timestamps.'
);
select set_config('request.jwt.claim.role', '', true);

-- PostgreSQL now() / transaction_timestamp() is fixed at transaction start. A
-- command that claims and completes one receipt inside one transaction therefore
-- used to persist identical created/completed timestamps. Use wall-clock defaults
-- for future claims and a transition guard for terminal completion timestamps.
-- Historical receipts are intentionally not backfilled with invented durations.
alter table public.studio2_operation_receipts
  alter column created_at set default clock_timestamp(),
  alter column updated_at set default clock_timestamp();

create or replace function private.studio2_operation_receipt_wallclock_completion()
returns trigger
language plpgsql
set search_path = pg_catalog
as $wallclock_completion$
begin
  if old.status is distinct from new.status
     and new.status in ('succeeded', 'failed', 'uncertain') then
    new.completed_at := clock_timestamp();
    new.updated_at := new.completed_at;
  end if;

  return new;
end
$wallclock_completion$;

revoke all on function private.studio2_operation_receipt_wallclock_completion()
  from public, anon, authenticated;

drop trigger if exists studio2_operation_receipts_wallclock_completion
  on public.studio2_operation_receipts;
create trigger studio2_operation_receipts_wallclock_completion
before update of status, completed_at on public.studio2_operation_receipts
for each row
execute function private.studio2_operation_receipt_wallclock_completion();

create index if not exists studio2_operation_receipts_reconciliation_pending_idx
  on public.studio2_operation_receipts (status, created_at desc)
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
  reconciliation_metrics as (
    select
      workflow.workflow_class,
      count(receipt.operation_id) as reconciliation_pending_operations
    from workflow_classes workflow
    left join public.studio2_operation_receipts receipt
      on receipt.status in ('processing', 'uncertain')
     and private.v3_observability_workflow_class(receipt.command) = workflow.workflow_class
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
        'reconciliationPendingOperations', reconciliation.reconciliation_pending_operations,
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
  join reconciliation_metrics reconciliation
    on reconciliation.workflow_class = operation.workflow_class
  join consequence_metrics consequence
    on consequence.workflow_class = operation.workflow_class;

  return jsonb_build_object(
    'schemaVersion', 2,
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
  'S9 bounded workflow outcome/latency/consequence metrics plus current unresolved reconciliation backlog. Requires system.read and exposes fixed low-cardinality workflow classes only.';

notify pgrst, 'reload schema';

commit;
