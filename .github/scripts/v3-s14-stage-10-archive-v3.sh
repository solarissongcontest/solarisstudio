#!/usr/bin/env bash
set -euo pipefail

s14_result_evidence_hash() {
  db_scalar "
select md5(coalesce(
  jsonb_agg(
    jsonb_build_object(
      'showId',show_id,
      'version',version,
      'rowCount',result_row_count,
      'rows',result_rows
    ) order by show_id,version
  ),
  '[]'::jsonb
)::text)
from private.v3_result_versions
where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid);
"
}

s14_publication_evidence_hash() {
  db_scalar "
select md5(coalesce(
  jsonb_agg(
    jsonb_build_object(
      'showId',show_id,
      'state',state,
      'version',version,
      'sourceResultVersion',source_result_version,
      'config',frozen_config
    ) order by show_id
  ),
  '[]'::jsonb
)::text)
from public.studio2_show_publication_controls
where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid);
"
}

s14_receipt_ids() {
  db_scalar "select coalesce(jsonb_agg(id order by id),'[]'::jsonb)::text from public.studio2_operation_receipts;"
}

assert_receipts_retained() {
  local before_json="$1" after_json="$2"
  python3 - "$before_json" "$after_json" <<'PY'
import json,sys
before=set(json.loads(sys.argv[1]))
after=set(json.loads(sys.argv[2]))
missing=sorted(before-after)
if missing:
    raise SystemExit(f"archive removed {len(missing)} pre-existing operation receipts: {missing[:5]}")
if not before:
    raise SystemExit("archive evidence expected at least one pre-existing operation receipt")
PY
}

s14_service_rpc_request() {
  local function_name="$1" body="$2"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
}

run_s14_stage_10_archive_v3() {
  log "Stage 10/10 prepared verifier: canonical V3 lifecycle reconciliation, Archive consequences and historical retention"

  for helper in assert_anonymous_result_matches_version; do
    declare -F "$helper" >/dev/null || fail "Stage 10 requires Stage 9 helper '$helper' to be sourced first"
  done

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and version=2 and result_row_count>0;")" == "3" ]] || fail "Stage 10 requires non-empty immutable result version 2 for all three shows"
  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and state='public' and source_result_version=2;")" == "3" ]] || fail "Stage 10 requires all three shows publicly bound to result version 2"

  result_hash_before="$(s14_result_evidence_hash)"
  publication_hash_before="$(s14_publication_evidence_hash)"
  receipt_ids_before="$(s14_receipt_ids)"
  [[ -n "$result_hash_before" && -n "$publication_hash_before" ]] || fail "Stage 10 could not snapshot pre-archive historical evidence"

  runtime_state="$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  runtime_version="$(db_scalar "select version::text from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  [[ "$runtime_version" =~ ^[1-9][0-9]*$ ]] || fail "Stage 10 canonical runtime has no valid version"

  # V3 deliberately keeps repeated show-level Jury/Televote/Results cycles out of
  # the coarse edition state machine. Once the Grand Final publication points at
  # retained immutable result truth, the canonical lifecycle command may perform
  # the one server-authoritative reconciliation edge into edition state=results.
  if [[ "$runtime_state" != "results" ]]; then
    results_operation_id='14000000-0000-4013-8100-000000000001'
    results_idempotency_key='s14-stage10-final-publication-results-v3'

    rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
      "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"results\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$runtime_version,\"p_operation_id\":\"$results_operation_id\",\"p_idempotency_key\":\"$results_idempotency_key\"}"
    expect_success "reconcile final publication to canonical edition results"
    expect_json "final-publication reconciliation reached results" state results
    expect_json "final-publication reconciliation used canonical bridge" reconciledFromFinalPublication true

    results_version="$(printf '%s' "$HTTP_BODY" | json_value runtimeVersion)"
    [[ "$results_version" == "$((runtime_version + 1))" ]] || fail "final-publication reconciliation did not increment runtime exactly once"
    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$results_operation_id'::uuid and idempotency_key='$results_idempotency_key' and command='edition.transition' and status='succeeded';")" == "1" ]] || fail "canonical final-publication reconciliation receipt is missing or duplicated"
    runtime_version="$results_version"
  fi

  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "results" ]] || fail "S14 Stage 10 did not reach canonical edition runtime state=results"

  # Every authenticated lifecycle mutation now uses the single V3 writer.
  post_operation_id='14000000-0000-4013-8100-000000000002'
  post_idempotency_key='s14-stage10-post-edition-v3'
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"post_edition\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$runtime_version,\"p_operation_id\":\"$post_operation_id\",\"p_idempotency_key\":\"$post_idempotency_key\"}"
  expect_success "transition S14 edition results -> post_edition through V3"
  expect_json "S14 edition reached post_edition" state post_edition
  post_version="$(printf '%s' "$HTTP_BODY" | json_value runtimeVersion)"
  [[ "$post_version" == "$((runtime_version + 1))" ]] || fail "V3 post-edition transition did not increment runtime exactly once"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$post_operation_id'::uuid and idempotency_key='$post_idempotency_key' and command='edition.transition' and status='succeeded';")" == "1" ]] || fail "canonical post-edition transition receipt is missing or duplicated"

  # Authenticated callers must not be able to use the superseded V2 writer for
  # Archive. The runtime trigger also fences direct/legacy Archive mutation.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v2 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null}"
  expect_failure "legacy v2 archive bypass"
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "post_edition" ]] || fail "legacy archive bypass changed canonical runtime"

  archive_operation_id='14000000-0000-4013-8100-000000000003'
  archive_idempotency_key='s14-stage10-archive-v3'
  archive_reason='S14 complete-edition archive verification'

  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":\"$archive_reason\",\"p_approval_request_id\":null,\"p_expected_version\":$post_version,\"p_operation_id\":\"$archive_operation_id\",\"p_idempotency_key\":\"$archive_idempotency_key\"}"
  expect_success "canonical V3 archive transition"
  expect_json "V3 archive reached archived" state archived
  expect_json "V3 archive operation identity" operationId "$archive_operation_id"
  expect_json "V3 archive first execution is not replay" replayed false

  archived_version="$(printf '%s' "$HTTP_BODY" | json_value runtimeVersion)"
  [[ "$archived_version" =~ ^[1-9][0-9]*$ ]] || fail "V3 archive returned invalid runtimeVersion"
  [[ "$archived_version" == "$((post_version + 1))" ]] || fail "V3 archive did not increment runtime exactly once"
  [[ "$(db_scalar "select status from public.editions where id='$EDITION_ID'::uuid;")" == "active" ]] || fail "archive incorrectly rewrote legacy editions.status into lifecycle authority"

  # Exact lost-response retry is claimed before mutable-state evaluation and must
  # replay the durable receipt rather than executing a second Archive transition.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":\"$archive_reason\",\"p_approval_request_id\":null,\"p_expected_version\":$post_version,\"p_operation_id\":\"$archive_operation_id\",\"p_idempotency_key\":\"$archive_idempotency_key\"}"
  expect_success "canonical V3 archive lost-response replay"
  expect_json "archive replay operation identity" operationId "$archive_operation_id"
  expect_json "archive replay state" state archived
  expect_json "archive exact retry is marked replayed" replayed true
  [[ "$(db_scalar "select version::text from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "$archived_version" ]] || fail "archive replay mutated runtime twice"

  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$archive_operation_id'::uuid and idempotency_key='$archive_idempotency_key' and command='edition.transition' and status='succeeded';")" == "1" ]] || fail "canonical Archive operation receipt is missing or duplicated"
  archive_event_id="$(db_scalar "select id::text from private.v3_domain_events where operation_id='$archive_operation_id'::uuid and event_type='edition.archived' and aggregate_id='$EDITION_ID' and aggregate_version=$archived_version limit 1;")"
  [[ -n "$archive_event_id" ]] || fail "canonical edition.archived DomainEvent is missing"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$archive_operation_id'::uuid and event_type='edition.archived';")" == "1" ]] || fail "canonical edition.archived DomainEvent is duplicated"
  [[ "$(db_scalar "select payload->>'lifecycleAuthority' from private.v3_domain_events where id='$archive_event_id'::uuid;")" == "studio2_edition_runtime" ]] || fail "archive DomainEvent does not identify the canonical lifecycle authority"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "1" ]] || fail "canonical edition.tasks Archive outbox consequence is missing or duplicated"

  # Changed semantics may not reuse the same operation identity.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":\"changed semantic request\",\"p_approval_request_id\":null,\"p_expected_version\":$post_version,\"p_operation_id\":\"$archive_operation_id\",\"p_idempotency_key\":\"$archive_idempotency_key\"}"
  expect_failure "archive semantic idempotency conflict"
  [[ "$(db_scalar "select version::text from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "$archived_version" ]] || fail "semantic idempotency conflict changed archived runtime"

  # Consume the actual S4 consequence. QA must not substitute a direct task
  # reconciliation call for the event-backed worker path it is certifying.
  archive_worker_id='s14-stage10-archive-worker'
  s14_service_rpc_request studio2_claim_domain_event_deliveries \
    "{\"p_consumer_key\":\"edition.tasks\",\"p_worker_id\":\"$archive_worker_id\",\"p_limit\":100,\"p_lease_seconds\":60}"
  expect_success "claim edition.tasks Archive outbox"
  printf '%s' "$HTTP_BODY" | grep -Fq "$archive_event_id" || fail "edition.tasks worker did not claim the Archive event"

  s14_service_rpc_request studio2_process_edition_domain_event \
    "{\"p_event_id\":\"$archive_event_id\",\"p_consumer_key\":\"edition.tasks\",\"p_worker_id\":\"$archive_worker_id\"}"
  expect_success "process canonical Archive consequences"
  [[ "$(db_scalar "select status from private.v3_domain_event_outbox where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "completed" ]] || fail "Archive outbox consequence did not complete"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "1" ]] || fail "Archive consequence consumer receipt is missing or duplicated"

  dead_workflow_tasks="$(db_scalar "
select count(*)
from public.studio2_organizer_tasks task
where task.edition_id='$EDITION_ID'::uuid
  and task.state<>'resolved'
  and task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\\.(transition|subsystem))\\.';
")"
  [[ "$dead_workflow_tasks" == "0" ]] || fail "archived edition still has $dead_workflow_tasks impossible current-workflow Organizer tasks"

  unreconciled_task_notifications="$(db_scalar "
select count(*)
from public.admin_notifications notification
join public.studio2_organizer_tasks task on task.source_key=notification.source_key
where task.edition_id='$EDITION_ID'::uuid
  and task.state='resolved'
  and notification.requires_action
  and notification.resolved_at is null;
")"
  [[ "$unreconciled_task_notifications" == "0" ]] || fail "archived edition has $unreconciled_task_notifications resolved-task notifications still claiming action"

  deliverable_resolved_task_notifications="$(db_scalar "
select count(*)
from public.notification_deliveries delivery
join public.studio2_organizer_tasks task on delivery.subject_id=task.id::text
where task.edition_id='$EDITION_ID'::uuid
  and task.state='resolved'
  and delivery.category='organizer_tasks'
  and delivery.status in ('pending','processing','failed');
")"
  [[ "$deliverable_resolved_task_notifications" == "0" ]] || fail "archived edition has $deliverable_resolved_task_notifications deliverable notifications for resolved Organizer tasks"

  result_hash_after="$(s14_result_evidence_hash)"
  publication_hash_after="$(s14_publication_evidence_hash)"
  receipt_ids_after="$(s14_receipt_ids)"
  [[ "$result_hash_after" == "$result_hash_before" ]] || fail "archive mutated immutable result-version history"
  [[ "$publication_hash_after" == "$publication_hash_before" ]] || fail "archive mutated exact publication provenance"
  assert_receipts_retained "$receipt_ids_before" "$receipt_ids_after"

  assert_anonymous_result_matches_version "$SEMI_ONE_ID" 2
  assert_anonymous_result_matches_version "$SEMI_TWO_ID" 2
  assert_anonymous_result_matches_version "$FINAL_ID" 2

  log "S14_INVARIANT_TASKS_COMPLETE"
  log "S14_INVARIANT_NOTIFICATIONS_COMPLETE"
  log "S14_STAGE_10_ARCHIVE_COMPLETE"
}
