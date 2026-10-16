begin;

-- System V3 S10: measured operational indicators only. This intentionally
-- defines no success-rate, lag or availability target. Initial SLO thresholds
-- must be chosen from observed baselines, not invented during implementation.

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
  v_since timestamptz;
  v_operation_total bigint;
  v_operation_succeeded bigint;
  v_operation_failed bigint;
  v_operation_uncertain bigint;
  v_operation_processing bigint;
  v_completed_operations bigint;
  v_success_ratio numeric;
  v_event_count bigint;
  v_delivery_total bigint;
  v_delivery_pending bigint;
  v_delivery_processing bigint;
  v_delivery_completed bigint;
  v_delivery_dead_letter bigint;
  v_delivery_retried bigint;
  v_attempts bigint;
  v_avg_lag numeric;
  v_max_lag numeric;
  v_oldest_pending numeric;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;
  if v_window not between 5 and 10080 then
    raise exception 'SLI window must be between 5 and 10080 minutes' using errcode = '22023';
  end if;

  v_since := now() - make_interval(mins => v_window);

  select
    count(*),
    count(*) filter (where receipt.status = 'succeeded'),
    count(*) filter (where receipt.status = 'failed'),
    count(*) filter (where receipt.status = 'uncertain'),
    count(*) filter (where receipt.status = 'processing')
  into
    v_operation_total,
    v_operation_succeeded,
    v_operation_failed,
    v_operation_uncertain,
    v_operation_processing
  from public.studio2_operation_receipts receipt
  where receipt.created_at >= v_since;

  v_completed_operations := v_operation_succeeded + v_operation_failed + v_operation_uncertain;
  v_success_ratio := case
    when v_completed_operations = 0 then null
    else round(v_operation_succeeded::numeric / v_completed_operations::numeric, 6)
  end;

  select count(*)
  into v_event_count
  from private.v3_domain_events event_row
  where event_row.occurred_at >= v_since;

  select
    count(*),
    count(*) filter (where delivery.status = 'pending'),
    count(*) filter (where delivery.status = 'processing'),
    count(*) filter (where delivery.status = 'completed'),
    count(*) filter (where delivery.status = 'dead_letter'),
    count(*) filter (where delivery.attempt_count > 1),
    coalesce(sum(delivery.attempt_count), 0),
    round(avg(extract(epoch from (delivery.completed_at - delivery.created_at)))
      filter (where delivery.status = 'completed' and delivery.completed_at is not null)::numeric, 3),
    round(max(extract(epoch from (delivery.completed_at - delivery.created_at)))
      filter (where delivery.status = 'completed' and delivery.completed_at is not null)::numeric, 3),
    round(max(extract(epoch from (now() - delivery.created_at)))
      filter (where delivery.status in ('pending', 'processing'))::numeric, 3)
  into
    v_delivery_total,
    v_delivery_pending,
    v_delivery_processing,
    v_delivery_completed,
    v_delivery_dead_letter,
    v_delivery_retried,
    v_attempts,
    v_avg_lag,
    v_max_lag,
    v_oldest_pending
  from private.v3_domain_event_outbox delivery
  where delivery.created_at >= v_since;

  return jsonb_build_object(
    'generatedAt', now(),
    'windowMinutes', v_window,
    'windowStart', v_since,
    'operations', jsonb_build_object(
      'total', v_operation_total,
      'completed', v_completed_operations,
      'succeeded', v_operation_succeeded,
      'failed', v_operation_failed,
      'uncertain', v_operation_uncertain,
      'processing', v_operation_processing,
      'successRatio', v_success_ratio
    ),
    'domainEvents', jsonb_build_object(
      'emitted', v_event_count
    ),
    'consequences', jsonb_build_object(
      'total', v_delivery_total,
      'pending', v_delivery_pending,
      'processing', v_delivery_processing,
      'completed', v_delivery_completed,
      'deadLetter', v_delivery_dead_letter,
      'retried', v_delivery_retried,
      'attempts', v_attempts,
      'averageCompletedLagSeconds', v_avg_lag,
      'maxCompletedLagSeconds', v_max_lag,
      'oldestPendingAgeSeconds', v_oldest_pending
    ),
    'targets', null
  );
end
$sli$;

revoke all on function public.admin_system_v3_sli_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_v3_sli_snapshot(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
