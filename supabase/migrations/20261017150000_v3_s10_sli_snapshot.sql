begin;

-- System V3 S10: measured service-level indicators derived from the canonical
-- S9 privacy-safe observability projection. S10 must not create a second query
-- implementation over the same S2/S4 ledgers or silently diverge from S9.
--
-- This is instrumentation foundation only. Targets, error budgets and alerts
-- remain intentionally unset until the measured baseline is reviewed against
-- the canonical SLO classes.

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

  -- S9 owns the safe aggregate query boundary. S10 maps those measurements to
  -- SLI vocabulary rather than scanning operation/event/outbox ledgers again.
  v_observability := public.admin_system_observability_snapshot(v_window);
  v_operations := coalesce(v_observability -> 'operations', '{}'::jsonb);
  v_events := coalesce(v_observability -> 'events', '{}'::jsonb);
  v_deliveries := coalesce(v_observability -> 'deliveries', '{}'::jsonb);

  return jsonb_build_object(
    'schemaVersion', 2,
    'generatedAt', v_observability -> 'generatedAt',
    'windowMinutes', coalesce((v_observability ->> 'windowMinutes')::integer, v_window),
    'windowStart', v_observability -> 'windowStart',
    'source', jsonb_build_object(
      'projection', 'admin_system_observability_snapshot',
      'schemaVersion', v_observability -> 'schemaVersion'
    ),
    'coverage', jsonb_build_object(
      'state', 'foundation',
      'measured', jsonb_build_array(
        'operation_outcomes',
        'domain_event_volume',
        'consequence_queue_state',
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
      'processing', coalesce((v_deliveries ->> 'processing')::bigint, 0),
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
        (v_deliveries ->> 'oldestActionableAgeSeconds')::bigint,
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
  'S10 measured SLI foundation derived from the S9 privacy-safe observability projection. Targets/error budgets/alerts remain unset until baseline review.';

notify pgrst, 'reload schema';

commit;
