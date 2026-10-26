begin;

-- Solaris Studio V3 S15 / Worker 9: shared replay-safe task consequence runtime.
--
-- This closes the missing consumer stage for canonical DomainEvents whose task
-- truth is already derived by the Organizer task reconciler. It does not create
-- a second task authority: the consumer only reruns the existing deterministic
-- reconciliation against canonical domain state.
--
-- Start narrowly with edition.transitioned. The canonical lifecycle command
-- already emits that fact transactionally with its operation receipt, but the
-- event previously had no delivery consumer. Future event families must be
-- added here only after their producer and task source are both proven.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s15.shared-task-consequence-runtime',
  1,
  'forward_fix_only',
  false,
  null,
  'Adds a shared leased/idempotent DomainEvent consumer that reconciles existing canonical Organizer task truth for proven event producers. Initial scope is edition.transitioned; no Results calculation runtime is changed.'
)
on conflict (migration_key) do nothing;

create or replace function private.v3_event_requires_shared_task_reconciliation(
  p_event_type text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select p_event_type in (
    'edition.transitioned'
  );
$allowed$;

revoke all on function private.v3_event_requires_shared_task_reconciliation(text)
  from public, anon, authenticated;

-- Enqueue inside the same transaction that persists the DomainEvent. The S4
-- outbox primary key makes repeated emitter calls harmless.
create or replace function private.v3_enqueue_shared_task_consequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $enqueue$
begin
  if private.v3_event_requires_shared_task_reconciliation(new.event_type) then
    if new.edition_id is null then
      raise exception 'Task-reconciling domain event requires edition scope'
        using errcode = '23514';
    end if;

    insert into private.v3_domain_event_outbox (event_id, consumer_key)
    values (new.id, 'system.tasks')
    on conflict (event_id, consumer_key) do nothing;
  end if;

  return new;
end
$enqueue$;

revoke all on function private.v3_enqueue_shared_task_consequence()
  from public, anon, authenticated;

drop trigger if exists v3_enqueue_shared_task_consequence
  on private.v3_domain_events;
create trigger v3_enqueue_shared_task_consequence
after insert on private.v3_domain_events
for each row execute function private.v3_enqueue_shared_task_consequence();

create or replace function public.studio2_process_shared_task_domain_event(
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
  v_metadata jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_event_id is null
     or p_consumer_key <> 'system.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid shared task consequence consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null then
    raise exception 'Domain event was not found' using errcode = 'P0002';
  end if;

  if not private.v3_event_requires_shared_task_reconciliation(v_event.event_type)
     or v_event.edition_id is null then
    raise exception 'Domain event is not registered for shared task reconciliation'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Shared task consequence delivery was not found'
      using errcode = 'P0002';
  end if;

  -- Completion is replay-safe. If the consumer receipt already exists we do
  -- not execute reconciliation again; the S4 completion helper normalizes the
  -- outbox row back to completed and reports replay.
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
    raise exception 'Shared task consequence delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  -- The existing reconciler is the single projection rebuild path. It derives
  -- task open/resolved state from canonical domain tables, synchronizes task
  -- notifications, and prunes stale deliveries. Repeating it converges rather
  -- than duplicating side effects.
  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);

  v_metadata := jsonb_build_object(
    'effect', 'canonical-task-reconciliation',
    'eventType', v_event.event_type,
    'editionId', v_event.edition_id,
    'aggregateType', v_event.aggregate_type,
    'aggregateId', v_event.aggregate_id,
    'aggregateVersion', v_event.aggregate_version,
    'operationId', v_event.operation_id,
    'correlationId', v_event.correlation_id
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_shared_task_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_shared_task_domain_event(uuid, text, text)
  to service_role;

-- Do not manufacture historical side effects. Existing task state is already
-- independently rebuildable from canonical truth; this runtime governs new
-- events from the cutover point onward.

notify pgrst, 'reload schema';

commit;
