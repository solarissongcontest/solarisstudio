begin;

-- System V3 S9/S10 review follow-up.
--
-- This forward fix closes three evidence defects that cannot be solved by a
-- prettier dashboard:
--   1. terminal receipts inserted directly can carry transaction-stable
--      completed_at values older than wall-clock created_at defaults;
--   2. participant Jury submissions use the V3 Jury authority but were absent
--      from the canonical S2 operation ledger, while Organizer Jury commands
--      were incorrectly labelled as Jury submissions;
--   3. projection reconciliation has no canonical operation-receipt producer,
--      so an always-zero successful-operation SLI is not evidence.
--
-- The participant mutation remains owned by the existing proven V3 Jury writer.
-- We wrap that writer with S2 claim/complete/fail semantics instead of copying
-- its ballot-validation logic. Domain/caller rejections keep their existing RPC
-- error semantics and are not availability failures. Infrastructure/concurrency
-- failures after a valid command claim become durable failed operations while
-- the inner ballot subtransaction rolls back atomically.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.workflow-observability-authority-fix-v2',
  1,
  'forward_fix_only',
  false,
  null,
  'Measure actual participant Jury submission commands, normalize terminal insert timing, and stop advertising uninstrumented projection-reconciliation operation success.'
);
select set_config('request.jwt.claim.role', '', true);

-- ---------------------------------------------------------------------------
-- 1. Wall-clock terminal timestamps for both INSERT and UPDATE paths
-- ---------------------------------------------------------------------------

create or replace function private.studio2_operation_receipt_wallclock_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $wallclock_completion$
begin
  if tg_op = 'INSERT' then
    if new.status in ('succeeded', 'failed', 'uncertain') then
      -- A number of historical helpers insert a terminal receipt directly and
      -- explicitly pass now(). now() is transaction-stable, while the S9 review
      -- fix changed row defaults to clock_timestamp(). Always normalize terminal
      -- INSERT completion to advancing wall-clock time so duration cannot become
      -- negative merely because created_at was evaluated later.
      new.completed_at := clock_timestamp();
      new.updated_at := new.completed_at;
    elsif new.updated_at < new.created_at then
      new.updated_at := new.created_at;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status in ('succeeded', 'failed', 'uncertain')
     and (
       old.status is distinct from new.status
       or new.completed_at is distinct from old.completed_at
     ) then
    new.completed_at := clock_timestamp();
    new.updated_at := new.completed_at;
  end if;

  return new;
end
$wallclock_completion$;

revoke all on function private.studio2_operation_receipt_wallclock_completion()
  from public, anon, authenticated;

drop trigger if exists studio2_operation_receipts_wallclock_terminal_insert
  on public.studio2_operation_receipts;
create trigger studio2_operation_receipts_wallclock_terminal_insert
before insert on public.studio2_operation_receipts
for each row
when (new.status in ('succeeded', 'failed', 'uncertain'))
execute function private.studio2_operation_receipt_wallclock_completion();

-- The UPDATE trigger was introduced by the preceding review migration. Recreate
-- it here so this migration remains the final authority for the timing contract.
drop trigger if exists studio2_operation_receipts_wallclock_completion
  on public.studio2_operation_receipts;
create trigger studio2_operation_receipts_wallclock_completion
before update of status, completed_at on public.studio2_operation_receipts
for each row
execute function private.studio2_operation_receipt_wallclock_completion();

-- ---------------------------------------------------------------------------
-- 2. Canonical participant Jury submission operation boundary
-- ---------------------------------------------------------------------------

-- Preserve the proven participant writer as an internal implementation detail.
-- Renaming retains the exact existing validation, locking, private receipt and
-- ballot semantics; direct authenticated access is revoked immediately.
alter function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  rename to v3_submit_jury_ballot_legacy_impl;
revoke all on function public.v3_submit_jury_ballot_legacy_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated;

alter function public.v3_reconcile_jury_submission(uuid)
  rename to v3_reconcile_jury_submission_legacy_impl;
revoke all on function public.v3_reconcile_jury_submission_legacy_impl(uuid)
  from public, anon, authenticated;

create or replace function public.v3_submit_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid,
  _operation_id uuid,
  _request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $jury_submit$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_result jsonb;
  v_failed jsonb;
  v_sqlstate text;
  v_sqlerrm text;
  v_failure_code text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null or _preflight_id is null or _operation_id is null then
    raise exception 'Jury submission context is incomplete' using errcode = '22023';
  end if;
  if jsonb_typeof(_entries) is distinct from 'array'
     or jsonb_array_length(_entries) < 1
     or jsonb_array_length(_entries) > 50
     or pg_column_size(_entries) > 131072 then
    raise exception 'Jury ballot must be a bounded non-empty array'
      using errcode = '22023';
  end if;

  -- The caller-provided request hash remains non-authoritative, matching the
  -- original V3 Jury contract. S2 fingerprints the semantic request itself.
  perform _request_hash;

  v_claim := private.studio2_claim_operation(
    _operation_id,
    'jury-submit:' || _operation_id::text,
    _operation_id,
    'jury.submit',
    'R2',
    jsonb_build_object(
      'showId', _show_id,
      'channel', 'jury'
    ),
    jsonb_build_object(
      'showId', _show_id,
      'preflightId', _preflight_id,
      'entries', _entries
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      v_result := coalesce(v_claim -> 'result', '{}'::jsonb);
      if jsonb_typeof(v_result -> 'receipt') = 'object' then
        v_result := jsonb_set(v_result, '{receipt,replayed}', 'true'::jsonb, true);
      end if;
      return v_result || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'operation_id', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true,
      'server_time', clock_timestamp()
    );
  end if;

  begin
    -- Existing authority remains the only ballot writer. Its private
    -- v3_jury_operations receipt remains the participant-facing receipt source;
    -- S2 is the cross-system operation/observability ledger.
    v_result := public.v3_submit_jury_ballot_legacy_impl(
      _show_id,
      _entries,
      _preflight_id,
      _operation_id,
      null
    );
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_sqlerrm = message_text;

    -- Existing Jury domain/caller rejections intentionally remain RPC errors and
    -- roll back the S2 claim with the rest of the transaction. They are invalid
    -- requests/state, not service-availability failures. The legacy writer uses
    -- P0001 for its explicit domain rejections.
    if v_sqlstate in ('P0001', '22023', '42501', '23514') then
      raise;
    end if;

    v_failure_code := case
      when v_sqlstate in ('23505', '40001', '40P01') then 'STATE_CHANGED'
      when v_sqlstate = '57014' then 'TIMEOUT'
      else 'DATABASE'
    end;

    v_failed := private.studio2_fail_operation(
      _operation_id,
      v_failure_code,
      jsonb_build_object(
        'sqlstate', v_sqlstate,
        'message', left(coalesce(v_sqlerrm, 'Jury submission failed'), 1000),
        'showId', _show_id
      )
    );

    return jsonb_build_object(
      'ok', false,
      'operation_id', _operation_id,
      'status', 'failed',
      'error', v_failed -> 'error',
      'replayed', false,
      'server_time', clock_timestamp()
    );
  end;

  return private.studio2_complete_operation(_operation_id, v_result);
end
$jury_submit$;

revoke all on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  from public, anon;
grant execute on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.v3_reconcile_jury_submission(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $jury_reconcile$
declare
  v_actor uuid := auth.uid();
  v_legacy jsonb;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('found', false, 'server_time', clock_timestamp());
  end if;

  -- Preserve historical/private Jury receipt recovery first.
  v_legacy := public.v3_reconcile_jury_submission_legacy_impl(_operation_id);
  if coalesce((v_legacy ->> 'found')::boolean, false) then
    return v_legacy;
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = _operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'jury.submit';

  if v_receipt.operation_id is null then
    return v_legacy;
  end if;

  if v_receipt.status = 'succeeded' and v_receipt.result is not null then
    v_result := v_receipt.result;
    if jsonb_typeof(v_result -> 'receipt') = 'object' then
      v_result := jsonb_set(v_result, '{receipt,replayed}', 'true'::jsonb, true);
    end if;
    return v_result || jsonb_build_object(
      'found', true,
      'replayed', true,
      'server_time', clock_timestamp()
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'ok', false,
    'operation_id', v_receipt.operation_id,
    'status', v_receipt.status,
    'error', case
      when v_receipt.error_code is null then null
      else jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      )
    end,
    'server_time', clock_timestamp()
  );
end
$jury_reconcile$;

revoke all on function public.v3_reconcile_jury_submission(uuid)
  from public, anon;
grant execute on function public.v3_reconcile_jury_submission(uuid)
  to authenticated, service_role;

comment on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text) is
  'Canonical V3 participant Jury command wrapper. Preserves the proven Jury writer while recording valid submission execution in the S2 operation ledger for idempotency/reconciliation/SLI evidence.';
comment on function public.v3_reconcile_jury_submission(uuid) is
  'Reconciles both historical private Jury receipts and the canonical S2 Jury submission operation state for the authenticated owner.';

-- ---------------------------------------------------------------------------
-- 3. Honest workflow classification and bounded aggregate projection
-- ---------------------------------------------------------------------------

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
    when p_command = 'jury.submit'
      or p_command like 'jury.submit.%'
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
      ('notification_consequence'::text)
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
          and operation.completed_at >= operation.created_at
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
            and operation.completed_at >= operation.created_at
        )
      ))::bigint as p50_operation_latency_ms,
      round((
        percentile_cont(0.95) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
            and operation.completed_at >= operation.created_at
        )
      ))::bigint as p95_operation_latency_ms,
      round((
        percentile_cont(0.99) within group (
          order by extract(epoch from (operation.completed_at - operation.created_at)) * 1000
        ) filter (
          where operation.status in ('succeeded', 'failed', 'uncertain')
            and operation.completed_at is not null
            and operation.completed_at >= operation.created_at
        )
      ))::bigint as p99_operation_latency_ms
    from workflow_classes workflow
    left join classified_operations operation
      on operation.workflow_class = workflow.workflow_class
    group by workflow.workflow_class
  ),
  reconciliation_metrics as (
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
  join reconciliation_metrics reconciliation
    on reconciliation.workflow_class = operation.workflow_class
  join consequence_metrics consequence
    on consequence.workflow_class = operation.workflow_class;

  return jsonb_build_object(
    'schemaVersion', 3,
    'generatedAt', now(),
    'windowMinutes', p_lookback_minutes,
    'windowStart', v_since,
    'classification', 'fixed_low_cardinality',
    'operationReceiptScopes', jsonb_build_array(
      'confirmation_submission',
      'entry_mutation',
      'media_review_consequence',
      'jury_submission',
      'televote_submission',
      'voting_round_transition',
      'results_lifecycle',
      'publication',
      'notification_consequence'
    ),
    'unavailableOperationScopes', jsonb_build_array('projection_reconciliation'),
    'unavailableReason', 'Projection reconciliation is measured by S9 freshness/recovery evidence but has no canonical operation-receipt producer yet.',
    'classes', v_classes
  );
end
$workflow_snapshot$;

revoke all on function public.admin_system_workflow_observability_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_workflow_observability_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_workflow_observability_snapshot(integer) is
  'S9 bounded operation-receipt workflow metrics. Only scopes with real canonical S2 producers are returned. Projection reconciliation remains separate freshness/recovery evidence until it gains a canonical operation producer.';

-- Keep exact traces honest for historical malformed/equal timestamps too.
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
      or v_operation.completed_at < v_operation.created_at then null
    else round(extract(epoch from (v_operation.completed_at - v_operation.created_at)) * 1000)::bigint
  end;
  v_age_ms := greatest(
    0,
    round(extract(epoch from (clock_timestamp() - v_operation.created_at)) * 1000)::bigint
  );

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
  'S9 exact privacy-safe operation trace. Negative/invalid historical durations are reported as unmeasured rather than fabricated latency.';

notify pgrst, 'reload schema';

commit;
