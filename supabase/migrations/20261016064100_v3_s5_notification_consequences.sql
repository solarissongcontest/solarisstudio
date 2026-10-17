begin;

-- System V3 S5: notification_deliveries is already the authoritative delivery
-- lifecycle. Bridge durable queue/delivery/failure transitions into the shared
-- operation ledger + DomainEvent/outbox model and project actual failures into
-- Organizer Tasks. No push content is copied into DomainEvent payloads.

create or replace function private.v3_notification_transition_operation_id(
  p_delivery_id uuid,
  p_event_type text,
  p_attempt_count integer
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $identity$
declare
  v_fingerprint text;
begin
  if p_delivery_id is null or p_attempt_count is null or p_attempt_count < 0 then
    raise exception 'Notification transition identity is incomplete' using errcode = '22023';
  end if;
  if p_event_type not in ('notification.queued','notification.delivered','notification.failed') then
    raise exception 'Unsupported notification transition identity' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    case p_event_type
      when 'notification.queued' then 'notification.queue'
      when 'notification.delivered' then 'notification.deliver'
      else 'notification.fail'
    end,
    'R1',
    jsonb_build_object('deliveryId', p_delivery_id),
    jsonb_build_object('eventType', p_event_type, 'attemptCount', p_attempt_count)
  );

  return (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;
end
$identity$;

revoke all on function private.v3_notification_transition_operation_id(uuid, text, integer)
  from public, anon, authenticated;

create or replace function private.v3_emit_notification_delivery_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_event_type text;
  v_command text;
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      v_event_type := 'notification.queued';
      v_command := 'notification.queue';
    elsif new.status = 'sent' then
      v_event_type := 'notification.delivered';
      v_command := 'notification.deliver';
    elsif new.status = 'failed' then
      v_event_type := 'notification.failed';
      v_command := 'notification.fail';
    else
      return new;
    end if;
  else
    if old.status is not distinct from new.status then
      return new;
    end if;

    if old.status = 'failed' and new.status = 'pending' then
      v_event_type := 'notification.queued';
      v_command := 'notification.queue';
    elsif new.status = 'sent' then
      v_event_type := 'notification.delivered';
      v_command := 'notification.deliver';
    elsif new.status = 'failed' then
      v_event_type := 'notification.failed';
      v_command := 'notification.fail';
    else
      -- processing leases, quiet-hour deferrals, abandoned-lease recovery and
      -- suppression are operational states, not canonical notification facts.
      return new;
    end if;
  end if;

  v_operation_id := private.v3_notification_transition_operation_id(
    new.id,
    v_event_type,
    new.attempt_count
  );
  v_scope := jsonb_build_object('deliveryId', new.id);
  v_request := jsonb_build_object(
    'eventType', v_event_type,
    'attemptCount', new.attempt_count,
    'status', new.status
  );
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R1',
    v_scope,
    v_request
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
    v_operation_id,
    auth.uid(),
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    v_command,
    'R1',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'deliveryId', new.id,
      'status', new.status,
      'attemptCount', new.attempt_count
    ),
    coalesce(new.sent_at, new.last_attempt_at, new.created_at, now())
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from auth.uid()
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Notification transition identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    'notification_delivery',
    new.id::text,
    new.attempt_count::bigint,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'deliveryId', new.id,
      'category', new.category,
      'sourceEventType', new.event_type,
      'subjectId', new.subject_id,
      'status', new.status,
      'attemptCount', new.attempt_count
    ),
    1,
    array['notification.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_notification_delivery_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_notification_delivery_event
  on public.notification_deliveries;
create trigger v3_emit_notification_delivery_event
after insert or update of status
on public.notification_deliveries
for each row
execute function private.v3_emit_notification_delivery_event();

create or replace function private.v3_reconcile_notification_delivery_task(
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_recursive_failure boolean := false;
begin
  select delivery.*
  into v_delivery
  from public.notification_deliveries delivery
  where delivery.id = p_delivery_id;

  if v_delivery.id is null then
    update public.studio2_organizer_tasks task
    set state = 'resolved',
        resolved_at = coalesce(task.resolved_at, now()),
        last_evaluated_at = now(),
        updated_at = now()
    where task.source_key = 'notification-delivery:' || p_delivery_id::text
      and task.state <> 'resolved';
    return;
  end if;

  if v_delivery.category = 'organizer_tasks' then
    select exists (
      select 1
      from public.studio2_organizer_tasks parent_task
      where parent_task.id::text = v_delivery.subject_id
        and parent_task.task_type = 'notification.delivery_failed'
    ) into v_recursive_failure;
  end if;

  if v_delivery.status = 'failed' and not v_recursive_failure then
    insert into public.studio2_organizer_tasks (
      assigned_to,
      source_kind,
      source_id,
      source_key,
      task_type,
      required_capability,
      priority,
      state,
      title,
      description,
      href,
      due_at,
      resolution_predicate,
      opened_at,
      resolved_at,
      last_evaluated_at,
      updated_at
    ) values (
      null,
      'notification_delivery',
      v_delivery.id::text,
      'notification-delivery:' || v_delivery.id::text,
      'notification.delivery_failed',
      'system.manage',
      case when v_delivery.attempt_count >= 3 then 'critical' else 'high' end,
      'open',
      'Notification delivery failed',
      'A Solaris notification failed after ' || v_delivery.attempt_count::text ||
        ' delivery attempt' || case when v_delivery.attempt_count = 1 then '' else 's' end ||
        '. Review the delivery before retrying it.',
      '/admin/system-operations',
      null,
      jsonb_build_object(
        'table', 'notification_deliveries',
        'deliveryId', v_delivery.id,
        'resolvedWhen', 'delivery status is no longer failed',
        'retryRpc', 'admin_retry_failed_notification_delivery'
      ),
      coalesce(v_delivery.last_attempt_at, now()),
      null,
      now(),
      now()
    )
    on conflict (source_key) do update set
      assigned_to = excluded.assigned_to,
      required_capability = excluded.required_capability,
      priority = excluded.priority,
      state = 'open',
      title = excluded.title,
      description = excluded.description,
      href = excluded.href,
      resolution_predicate = excluded.resolution_predicate,
      resolved_at = null,
      last_evaluated_at = now(),
      updated_at = now();
  else
    update public.studio2_organizer_tasks task
    set state = 'resolved',
        resolved_at = coalesce(task.resolved_at, now()),
        last_evaluated_at = now(),
        updated_at = now()
    where task.source_key = 'notification-delivery:' || v_delivery.id::text
      and task.state <> 'resolved';
  end if;
end
$reconcile$;

revoke all on function private.v3_reconcile_notification_delivery_task(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_process_notification_domain_event(
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
  v_delivery_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'notification.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Notification domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'notification.queued',
       'notification.delivered',
       'notification.failed'
     ) then
    raise exception 'Notification consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  begin
    v_delivery_id := v_event.aggregate_id::uuid;
  exception when invalid_text_representation then
    raise exception 'Notification event has invalid delivery provenance' using errcode = '23514';
  end;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Notification domain event delivery was not found'
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
    raise exception 'Notification domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.v3_reconcile_notification_delivery_task(v_delivery_id);
  v_task_notifications := private.studio2_sync_task_notifications(null);
  v_pruned_notifications := private.studio2_prune_stale_task_notifications(null);

  v_metadata := jsonb_build_object(
    'effect', 'notification-delivery-task-reconciliation',
    'deliveryId', v_delivery_id,
    'eventType', v_event.event_type,
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

revoke all on function public.studio2_process_notification_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_notification_domain_event(uuid, text, text)
  to service_role;

commit;
