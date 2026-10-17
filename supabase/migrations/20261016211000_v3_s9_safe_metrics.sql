begin;

-- System V3 S9: privacy-safe operational metrics over the canonical S2/S4
-- durability ledgers. This projection exposes counts and timing only. It never
-- returns semantic requests, operation results, actor identities, event payloads,
-- consumer result metadata or raw error metadata.

create or replace function public.admin_system_observability_snapshot(
  p_lookback_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_since timestamptz;
  v_operations jsonb := '{}'::jsonb;
  v_events jsonb := '{}'::jsonb;
  v_deliveries jsonb := '{}'::jsonb;
  v_consumers jsonb := '[]'::jsonb;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if p_lookback_minutes is null or p_lookback_minutes not between 1 and 10080 then
    raise exception 'Observability lookback must be between 1 minute and 7 days'
      using errcode = '22023';
  end if;

  v_since := now() - make_interval(mins => p_lookback_minutes);

  select jsonb_build_object(
    'total', count(*),
    'completed', count(*) filter (where receipt.status in ('succeeded', 'failed', 'uncertain')),
    'processing', count(*) filter (where receipt.status = 'processing'),
    'succeeded', count(*) filter (where receipt.status = 'succeeded'),
    'failed', count(*) filter (where receipt.status = 'failed'),
    'uncertain', count(*) filter (where receipt.status = 'uncertain'),
    'successRate', case
      when count(*) filter (where receipt.status in ('succeeded', 'failed', 'uncertain')) = 0 then null
      else round(
        (count(*) filter (where receipt.status = 'succeeded'))::numeric
        / (count(*) filter (where receipt.status in ('succeeded', 'failed', 'uncertain')))::numeric,
        4
      )
    end,
    'oldestProcessingAgeSeconds', coalesce(
      round(max(extract(epoch from (now() - receipt.created_at)))
        filter (where receipt.status = 'processing'))::bigint,
      0
    ),
    'errorCounts', coalesce((
      select jsonb_object_agg(error_code, error_count order by error_code)
      from (
        select candidate.error_code, count(*) as error_count
        from public.studio2_operation_receipts candidate
        where candidate.created_at >= v_since
          and candidate.error_code is not null
        group by candidate.error_code
      ) errors
    ), '{}'::jsonb)
  )
  into v_operations
  from public.studio2_operation_receipts receipt
  where receipt.created_at >= v_since;

  select jsonb_build_object(
    'total', count(*),
    'correlations', count(distinct event_row.correlation_id),
    'eventTypeCounts', coalesce((
      select jsonb_object_agg(event_type, event_count order by event_type)
      from (
        select candidate.event_type, count(*) as event_count
        from private.v3_domain_events candidate
        where candidate.occurred_at >= v_since
        group by candidate.event_type
      ) event_types
    ), '{}'::jsonb)
  )
  into v_events
  from private.v3_domain_events event_row
  where event_row.occurred_at >= v_since;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'consumerKey', summary.consumer_key,
        'total', summary.total,
        'pending', summary.pending,
        'processing', summary.processing,
        'completed', summary.completed,
        'deadLetter', summary.dead_letter,
        'retrying', summary.retrying,
        'totalAttempts', summary.total_attempts,
        'maxAttempts', summary.max_attempts
      )
      order by summary.consumer_key
    ),
    '[]'::jsonb
  )
  into v_consumers
  from (
    select
      delivery.consumer_key,
      count(*) as total,
      count(*) filter (where delivery.status = 'pending') as pending,
      count(*) filter (where delivery.status = 'processing') as processing,
      count(*) filter (where delivery.status = 'completed') as completed,
      count(*) filter (where delivery.status = 'dead_letter') as dead_letter,
      count(*) filter (where delivery.attempt_count > 1) as retrying,
      coalesce(sum(delivery.attempt_count), 0) as total_attempts,
      coalesce(max(delivery.attempt_count), 0) as max_attempts
    from private.v3_domain_event_outbox delivery
    where delivery.created_at >= v_since
    group by delivery.consumer_key
  ) summary;

  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where delivery.status = 'pending'),
    'processing', count(*) filter (where delivery.status = 'processing'),
    'completed', count(*) filter (where delivery.status = 'completed'),
    'deadLetter', count(*) filter (where delivery.status = 'dead_letter'),
    'retrying', count(*) filter (where delivery.attempt_count > 1),
    'totalAttempts', coalesce(sum(delivery.attempt_count), 0),
    'expiredProcessingLeases', count(*) filter (
      where delivery.status = 'processing'
        and delivery.lease_expires_at is not null
        and delivery.lease_expires_at <= now()
    ),
    'oldestActionableAgeSeconds', coalesce(
      round(max(extract(epoch from (now() - delivery.created_at))) filter (
        where delivery.status in ('pending', 'processing')
      ))::bigint,
      0
    ),
    'averageCompletedLagMs', coalesce(
      round(avg(extract(epoch from (delivery.completed_at - event_row.occurred_at)) * 1000)
        filter (where delivery.status = 'completed' and delivery.completed_at is not null))::bigint,
      0
    ),
    'p95CompletedLagMs', coalesce(
      round((
        percentile_cont(0.95) within group (
          order by extract(epoch from (delivery.completed_at - event_row.occurred_at)) * 1000
        ) filter (where delivery.status = 'completed' and delivery.completed_at is not null)
      ))::bigint,
      0
    ),
    'maxCompletedLagMs', coalesce(
      round(max(extract(epoch from (delivery.completed_at - event_row.occurred_at)) * 1000)
        filter (where delivery.status = 'completed' and delivery.completed_at is not null))::bigint,
      0
    ),
    'errorCounts', coalesce((
      select jsonb_object_agg(error_code, error_count order by error_code)
      from (
        select candidate.last_error_code as error_code, count(*) as error_count
        from private.v3_domain_event_outbox candidate
        where candidate.created_at >= v_since
          and candidate.last_error_code is not null
        group by candidate.last_error_code
      ) errors
    ), '{}'::jsonb),
    'consumers', v_consumers
  )
  into v_deliveries
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event_row on event_row.id = delivery.event_id
  where delivery.created_at >= v_since;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'windowMinutes', p_lookback_minutes,
    'windowStart', v_since,
    'operations', v_operations,
    'events', v_events,
    'deliveries', v_deliveries,
    'reconciliation', jsonb_build_object(
      'processingOperations', coalesce((v_operations ->> 'processing')::bigint, 0),
      'uncertainOperations', coalesce((v_operations ->> 'uncertain')::bigint, 0),
      'oldestProcessingAgeSeconds', coalesce((v_operations ->> 'oldestProcessingAgeSeconds')::bigint, 0),
      'deadLetterDeliveries', coalesce((v_deliveries ->> 'deadLetter')::bigint, 0),
      'expiredProcessingLeases', coalesce((v_deliveries ->> 'expiredProcessingLeases')::bigint, 0)
    )
  );
end
$snapshot$;

revoke all on function public.admin_system_observability_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_observability_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_observability_snapshot(integer) is
  'S9 privacy-safe operational counters and timing derived from canonical S2/S4 ledgers; requires system.read.';

notify pgrst, 'reload schema';

commit;
