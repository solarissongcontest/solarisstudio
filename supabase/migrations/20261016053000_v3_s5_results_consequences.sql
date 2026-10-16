begin;

-- System V3 S5: bridge the existing idempotent Results execution ledger into
-- the shared S2 operation ledger + S4 DomainEvent/outbox contract. The existing
-- studio2_execute_result_operation RPC remains authoritative for calculation,
-- reconciliation, review, locking, optimistic version checks and retry safety.

create or replace function private.v3_emit_result_execution_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_command text;
  v_event_type text;
  v_scope jsonb;
  v_fingerprint text;
  v_operation public.studio2_operation_receipts%rowtype;
begin
  -- Only canonical System-registry facts are emitted here. Unlock and reveal
  -- readiness remain explicit result operations, but are not falsely relabelled
  -- as calculated/verified/locked facts.
  if new.action = 'calculate' then
    v_command := 'results.calculate';
    v_event_type := 'results.calculated';
  elsif new.action = 'review' then
    v_command := 'results.verify';
    v_event_type := 'results.verified';
  elsif new.action = 'lock' then
    v_command := 'results.lock';
    v_event_type := 'results.locked';
  else
    return new;
  end if;

  if new.execution_id is null
     or new.edition_id is null
     or new.show_id is null
     or new.calculation_version < 1 then
    raise exception 'Completed Results execution lacks event provenance'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.studio2_result_operations operation
    where operation.show_id = new.show_id
      and operation.edition_id = new.edition_id
      and operation.calculation_version = new.calculation_version
  ) then
    raise exception 'Completed Results execution does not match canonical result state'
      using errcode = '23514';
  end if;

  v_scope := jsonb_build_object(
    'editionId', new.edition_id,
    'showId', new.show_id
  );
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R2',
    v_scope,
    jsonb_build_object(
      'executionId', new.execution_id,
      'action', new.action,
      'calculationVersion', new.calculation_version
    )
  );

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    new.execution_id,
    new.actor_user_id,
    new.execution_id::text,
    new.execution_id,
    v_fingerprint,
    v_command,
    'R2',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'executionId', new.execution_id,
      'editionId', new.edition_id,
      'showId', new.show_id,
      'action', new.action,
      'calculationVersion', new.calculation_version
    ),
    new.created_at
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_operation
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = new.execution_id
  for update;

  if v_operation.operation_id is null
     or v_operation.actor_id is distinct from new.actor_user_id
     or v_operation.command is distinct from v_command
     or v_operation.idempotency_key is distinct from new.execution_id::text
     or v_operation.correlation_id is distinct from new.execution_id
     or v_operation.request_fingerprint is distinct from v_fingerprint
     or v_operation.scope is distinct from v_scope
     or v_operation.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Results execution identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    'results',
    new.show_id::text,
    new.calculation_version,
    new.execution_id,
    new.edition_id,
    new.show_id,
    jsonb_build_object(
      'executionId', new.execution_id,
      'showId', new.show_id,
      'action', new.action,
      'calculationVersion', new.calculation_version
    ),
    1,
    array['results.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_result_execution_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_result_execution_event
  on public.studio2_result_operation_executions;
create trigger v3_emit_result_execution_event
after insert on public.studio2_result_operation_executions
for each row
execute function private.v3_emit_result_execution_event();

create or replace function public.studio2_process_results_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $process$
declare
  v_event private.v3_domain_events%rowtype;
  v_delivery private.v3_domain_event_outbox%rowtype;
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'results.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Results domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'results.calculated',
       'results.verified',
       'results.locked'
     ) then
    raise exception 'Results consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Results domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.v3_domain_event_consumer_receipts receipt
    where receipt.event_id = p_event_id
      and receipt.consumer_key = p_consumer_key
  ) then
    return public.studio2_complete_domain_event_delivery(
      p_event_id,
      p_consumer_key,
      p_worker_id,
      '{}'::jsonb
    );
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Results domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
  v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
  v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
  v_metadata := jsonb_build_object(
    'effect', 'results-task-reconciliation',
    'editionId', v_event.edition_id,
    'showId', v_event.show_id,
    'taskNotificationsChanged', v_task_notifications,
    'staleTaskNotificationsPruned', v_pruned_notifications
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_results_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_results_domain_event(uuid, text, text)
  to service_role;

commit;
