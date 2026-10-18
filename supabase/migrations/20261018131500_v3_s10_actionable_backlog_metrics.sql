begin;

-- System V3 S9/S10 follow-up: a future retry is pending, but it is not yet
-- actionable. Keep the canonical broad delivery snapshot stable and add one
-- privacy-safe S9-owned backlog projection that distinguishes ready work from
-- intentional retry delay. S10 consumes this projection rather than scanning
-- the outbox independently.

create or replace function public.admin_system_observability_backlog_snapshot(
  p_lookback_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $backlog$
declare
  v_since timestamptz;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if p_lookback_minutes is null or p_lookback_minutes not between 1 and 10080 then
    raise exception 'Observability lookback must be between 1 minute and 7 days'
      using errcode = '22023';
  end if;

  v_since := now() - make_interval(mins => p_lookback_minutes);

  return (
    select jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'windowMinutes', p_lookback_minutes,
      'pending', count(*) filter (where delivery.status = 'pending'),
      'readyPending', count(*) filter (
        where delivery.status = 'pending'
          and delivery.available_at <= now()
      ),
      'deferredPending', count(*) filter (
        where delivery.status = 'pending'
          and delivery.available_at > now()
      ),
      'processing', count(*) filter (where delivery.status = 'processing'),
      'actionable', count(*) filter (
        where (delivery.status = 'pending' and delivery.available_at <= now())
           or delivery.status = 'processing'
      ),
      'oldestActionableAgeSeconds', coalesce(
        round(max(extract(epoch from (now() - delivery.created_at))) filter (
          where (delivery.status = 'pending' and delivery.available_at <= now())
             or delivery.status = 'processing'
        ))::bigint,
        0
      ),
      'nextDeferredReadyInSeconds', coalesce(
        greatest(
          0,
          round(min(extract(epoch from (delivery.available_at - now()))) filter (
            where delivery.status = 'pending'
              and delivery.available_at > now()
          ))::bigint
        ),
        0
      )
    )
    from private.v3_domain_event_outbox delivery
    where delivery.created_at >= v_since
  );
end
$backlog$;

revoke all on function public.admin_system_observability_backlog_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_observability_backlog_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_observability_backlog_snapshot(integer) is
  'S9 privacy-safe ready/deferred consequence backlog projection. Future retry delay is not classified as actionable work.';

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
  v_backlog jsonb;
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

  -- S9 owns both aggregate query boundaries. S10 only maps measurements into
  -- SLI vocabulary and must not read the S2/S4 ledgers directly.
  v_observability := public.admin_system_observability_snapshot(v_window);
  v_backlog := public.admin_system_observability_backlog_snapshot(v_window);
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
      'backlogProjection', 'admin_system_observability_backlog_snapshot',
      'schemaVersion', v_observability -> 'schemaVersion',
      'backlogSchemaVersion', v_backlog -> 'schemaVersion'
    ),
    'coverage', jsonb_build_object(
      'state', 'foundation',
      'measured', jsonb_build_array(
        'operation_outcomes',
        'domain_event_volume',
        'consequence_queue_state',
        'consequence_actionable_backlog',
        'consequence_completion_lag'
      ),
      'remaining', jsonb_build_array(
        'authoritative_submission_latency',
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
    'domainEvents', jsonb_build_object(
      'emitted', coalesce((v_events ->> 'total')::bigint, 0),
      'correlations', coalesce((v_events ->> 'correlations')::bigint, 0)
    ),
    'consequences', jsonb_build_object(
      'total', coalesce((v_deliveries ->> 'total')::bigint, 0),
      'pending', coalesce((v_deliveries ->> 'pending')::bigint, 0),
      'readyPending', coalesce((v_backlog ->> 'readyPending')::bigint, 0),
      'deferredPending', coalesce((v_backlog ->> 'deferredPending')::bigint, 0),
      'processing', coalesce((v_deliveries ->> 'processing')::bigint, 0),
      'actionable', coalesce((v_backlog ->> 'actionable')::bigint, 0),
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
        (v_backlog ->> 'oldestActionableAgeSeconds')::bigint,
        0
      ),
      'nextDeferredReadyInSeconds', coalesce(
        (v_backlog ->> 'nextDeferredReadyInSeconds')::bigint,
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
  'S10 measured SLI foundation derived only from S9 privacy-safe projections. Deferred retries are not actionable backlog.';

notify pgrst, 'reload schema';

commit;
