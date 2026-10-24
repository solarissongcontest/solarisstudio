begin;

-- System V3 S9/S10 observability truth repair.
--
-- A receipt can prove that a durable fact/consequence was recorded without
-- proving that every attempt at the user-facing command entered the same
-- denominator. Keep those two claims separate. The public workflow SLI surface
-- now exposes successful-operation ratios only for command boundaries that
-- claim S2 before executing the governed mutation.
--
-- Confirmation and public Televote currently bridge into S2 only after success;
-- Results consequence receipts are likewise completion facts; Notification
-- receipts describe lifecycle transitions and deliberately record
-- notification.fail as a successfully observed failure fact. Those are useful
-- operational/event evidence, but not honest attempt-level availability SLIs.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.attempt-sli-honesty',
  1,
  'forward_fix_only',
  false,
  null,
  'Stop advertising success-only/event-transition receipts as attempt-level workflow success evidence while preserving their trace and consequence telemetry.'
);
select set_config('request.jwt.claim.role', '', true);

-- Preserve the existing aggregate implementation as an owner-only raw source.
-- The new public wrapper filters only the SLI claim; classification and exact
-- operation traces remain available for every existing receipt command.
alter function public.admin_system_workflow_observability_snapshot(integer)
  rename to admin_system_workflow_observability_snapshot_unfiltered_v3;
revoke all on function public.admin_system_workflow_observability_snapshot_unfiltered_v3(integer)
  from public, anon, authenticated, service_role;

create or replace function public.admin_system_workflow_observability_snapshot(
  p_lookback_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $workflow_honest$
declare
  v_raw jsonb;
  v_classes jsonb := '[]'::jsonb;
begin
  v_raw := public.admin_system_workflow_observability_snapshot_unfiltered_v3(
    p_lookback_minutes
  );

  select coalesce(
    jsonb_agg(item order by item ->> 'scope'),
    '[]'::jsonb
  )
  into v_classes
  from jsonb_array_elements(coalesce(v_raw -> 'classes', '[]'::jsonb)) item
  where item ->> 'scope' in (
    'entry_mutation',
    'media_review_consequence',
    'jury_submission',
    'voting_round_transition',
    'publication'
  );

  return v_raw || jsonb_build_object(
    'operationReceiptScopes', jsonb_build_array(
      'entry_mutation',
      'media_review_consequence',
      'jury_submission',
      'voting_round_transition',
      'publication'
    ),
    'unavailableOperationScopes', jsonb_build_array(
      'confirmation_submission',
      'televote_submission',
      'results_lifecycle',
      'notification_consequence',
      'projection_reconciliation'
    ),
    'unavailableReasons', jsonb_build_object(
      'confirmation_submission',
        'Confirmation S2 receipts are bridged only after a successful canonical submission; failed or blocked attempts are not in the S2 denominator.',
      'televote_submission',
        'Public Televote S2 receipts are bridged only after successful anonymous-capable submission; rejected or failed attempts are not representable by the actor-required S2 receipt.',
      'results_lifecycle',
        'Results S2 consequence receipts represent completed execution facts; rejected or failed result-operation attempts are not yet a complete S2 denominator.',
      'notification_consequence',
        'Notification S2 receipts represent lifecycle facts; notification.fail is a successfully recorded failure transition rather than a successful delivery attempt.',
      'projection_reconciliation',
        'Projection reconciliation has freshness and recovery evidence but no canonical operation-receipt producer.'
    ),
    'classes', v_classes
  );
end
$workflow_honest$;

revoke all on function public.admin_system_workflow_observability_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_workflow_observability_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_workflow_observability_snapshot(integer) is
  'S9 workflow SLI projection. Attempt-level operation ratios are returned only for canonical pre-execution S2 command boundaries; completion/event bridges remain traceable but are explicitly unavailable as operation-success SLIs.';

-- Preserve the existing S10 mapping as an owner-only implementation, then put
-- an honest coverage contract in front of it. Because the old mapping resolves
-- the S9 function by its canonical name at execution time, it now consumes the
-- filtered S9 wrapper above; this wrapper filters again as a fail-closed guard.
alter function public.admin_system_v3_sli_snapshot(integer)
  rename to admin_system_v3_sli_snapshot_unfiltered_v3;
revoke all on function public.admin_system_v3_sli_snapshot_unfiltered_v3(integer)
  from public, anon, authenticated, service_role;

create or replace function public.admin_system_v3_sli_snapshot(
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $sli_honest$
declare
  v_raw jsonb;
  v_workflows jsonb := '[]'::jsonb;
begin
  v_raw := public.admin_system_v3_sli_snapshot_unfiltered_v3(p_window_minutes);

  select coalesce(
    jsonb_agg(item order by item ->> 'scope'),
    '[]'::jsonb
  )
  into v_workflows
  from jsonb_array_elements(coalesce(v_raw -> 'workflows', '[]'::jsonb)) item
  where item ->> 'scope' in (
    'entry_mutation',
    'media_review_consequence',
    'jury_submission',
    'voting_round_transition',
    'publication'
  );

  return v_raw || jsonb_build_object(
    'coverage', jsonb_build_object(
      'state', 'partial_workflow_measured',
      'measured', jsonb_build_array(
        'operation_outcomes',
        'domain_event_volume',
        'consequence_queue_state',
        'consequence_completion_lag',
        'workflow_operation_latency',
        'workflow_consequence_lag',
        'workflow_reconciliation_pressure'
      ),
      'remaining', jsonb_build_array(
        'authoritative_submission_latency',
        'core_read_availability',
        'projection_freshness_by_projection'
      ),
      'operationReceiptScopes', jsonb_build_array(
        'entry_mutation',
        'media_review_consequence',
        'jury_submission',
        'voting_round_transition',
        'publication'
      ),
      'unavailableOperationScopes', jsonb_build_array(
        'confirmation_submission',
        'televote_submission',
        'results_lifecycle',
        'notification_consequence',
        'projection_reconciliation'
      )
    ),
    'workflows', v_workflows
  );
end
$sli_honest$;

revoke all on function public.admin_system_v3_sli_snapshot(integer)
  from public, anon;
grant execute on function public.admin_system_v3_sli_snapshot(integer)
  to authenticated, service_role;

comment on function public.admin_system_v3_sli_snapshot(integer) is
  'S10 SLI snapshot with partial workflow measurement. Success-only and lifecycle-event bridges are excluded from attempt-level operation-success evidence until their real command boundaries are instrumented.';

notify pgrst, 'reload schema';

commit;
