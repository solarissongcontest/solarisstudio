begin;

-- System V3 S9: one bounded operational trace from command receipt through
-- DomainEvent and consumer delivery state. This is diagnostic projection only;
-- canonical writes continue to belong to S2/S4 and domain commands.

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'eventId', event_row.id,
        'eventType', event_row.event_type,
        'aggregateType', event_row.aggregate_type,
        'aggregateId', event_row.aggregate_id,
        'aggregateVersion', event_row.aggregate_version,
        'editionId', event_row.edition_id,
        'showId', event_row.show_id,
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
              'lastErrorCode', delivery.last_error_code,
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
    'generatedAt', now(),
    'operation', jsonb_build_object(
      'operationId', v_operation.operation_id,
      'correlationId', v_operation.correlation_id,
      'command', v_operation.command,
      'riskClass', v_operation.risk_class,
      'scope', v_operation.scope,
      'status', v_operation.status,
      'actorId', v_operation.actor_id,
      'errorCode', v_operation.error_code,
      'createdAt', v_operation.created_at,
      'updatedAt', v_operation.updated_at,
      'completedAt', v_operation.completed_at
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

notify pgrst, 'reload schema';

commit;
