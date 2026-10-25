#!/usr/bin/env bash
set -euo pipefail

S14_POST_EDITION_OPERATION_ID='14000000-0000-4000-8000-000000000090'
S14_ARCHIVE_OPERATION_ID='14000000-0000-4000-8000-000000000091'
S14_POST_EDITION_IDEMPOTENCY_KEY='s14-stage10-post-edition-v3'
S14_ARCHIVE_IDEMPOTENCY_KEY='s14-stage10-archive-v3'
S14_ARCHIVE_WORKER_ID='s14-stage10-archive-worker'

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
  db_scalar "select coalesce(jsonb_agg(operation_id order by operation_id),'[]'::jsonb)::text from public.studio2_operation_receipts;"
}

s14_resolved_task_evidence_hash() {
  db_scalar "
select md5(coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id',task.id,
      'state',task.state,
      'resolvedAt',task.resolved_at
    ) order by task.id
  ),
  '[]'::jsonb
)::text)
from public.studio2_organizer_tasks task
where task.edition_id='$EDITION_ID'::uuid
  and task.state='resolved'
  and private.v3_archive_task_type_is_current_workflow(task.task_type);
"
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

s14_transition_edition_v3() {
  local token="$1" destination="$2" operation_id="$3" idempotency_key="$4" expected_version="$5"
  rpc_request "$token" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"$destination\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$expected_version,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\"}"
  expect_success "transition S14 edition to $destination through V3 authority"
  expect_json "S14 edition reached $destination" state "$destination"
}

run_s14_supabase_outage_injection() {
  log "Failure injection: client-visible Supabase API outage fails closed without fake success"

  local outage_url='http://127.0.0.1:1'
  local outage_body outage_status curl_status
  outage_body="$(mktemp)"

  set +e
  outage_status="$(curl --connect-timeout 1 --max-time 2 -sS -o "$outage_body" -w '%{http_code}' \
    -X POST "$outage_url/rest/v1/rpc/studio2_reconcile_operation" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ORGANIZER_A_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"p_operation_id\":\"$S14_ARCHIVE_OPERATION_ID\"}")"
  curl_status=$?
  set -e

  rm -f "$outage_body"
  (( curl_status != 0 )) || fail "simulated Supabase outage unexpectedly produced transport success with HTTP $outage_status"
  [[ -z "$outage_status" || "$outage_status" == "000" ]] || \
    fail "simulated Supabase outage produced an unexpected HTTP status $outage_status"

  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "archived" ]] || \
    fail "client-visible Supabase outage changed authoritative archived state"
  [[ "$(db_scalar "select status from public.studio2_operation_receipts where operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid;")" == "succeeded" ]] || \
    fail "client-visible Supabase outage fabricated or lost Archive operation truth"

  log "S14_FAILURE_SUPABASE_OUTAGE_COMPLETE"
}

run_s14_stage_10_archive() {
  log "Stage 10/10: archive through canonical V3 lifecycle authority and prove historical evidence + consequences"

  declare -F assert_anonymous_result_matches_version >/dev/null || \
    fail "Stage 10 requires Grand Final Publication helper 'assert_anonymous_result_matches_version' to be sourced first"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  runtime_state="$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  [[ "$runtime_state" == "results" ]] || fail "S14 Stage 10 requires canonical edition runtime state=results, got '$runtime_state'"

  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and version=(case show_id when '$SEMI_ONE_ID'::uuid then $SEMI_ONE_RESULT_VERSION when '$SEMI_TWO_ID'::uuid then $SEMI_TWO_RESULT_VERSION else $FINAL_RESULT_VERSION end) and result_row_count>0;")" == "3" ]] || \
    fail "Stage 10 requires non-empty immutable result captured versions for all three shows"
  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and state='public' and source_result_version=(case show_id when '$SEMI_ONE_ID'::uuid then $SEMI_ONE_RESULT_VERSION when '$SEMI_TWO_ID'::uuid then $SEMI_TWO_RESULT_VERSION else $FINAL_RESULT_VERSION end) and coalesce((private.studio2_normalise_publication_config(frozen_config)->>'results')::boolean,false);")" == "3" ]] || \
    fail "Stage 10 requires all three Results layers publicly bound to exact captured result versions"
  [[ "$(db_scalar "select private.v3_edition_final_results_ready('$EDITION_ID'::uuid)::text;")" == "true" ]] || \
    fail "Stage 10 requires canonical final-results readiness before Archive"

  result_hash_before="$(s14_result_evidence_hash)"
  publication_hash_before="$(s14_publication_evidence_hash)"
  receipt_ids_before="$(s14_receipt_ids)"
  [[ -n "$result_hash_before" && -n "$publication_hash_before" ]] || fail "Stage 10 could not snapshot pre-archive historical evidence"

  post_expected_version="$(db_scalar "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  s14_transition_edition_v3 "$ORGANIZER_A_TOKEN" post_edition "$S14_POST_EDITION_OPERATION_ID" "$S14_POST_EDITION_IDEMPOTENCY_KEY" "$post_expected_version"
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "post_edition" ]] || \
    fail "canonical edition runtime did not persist post_edition"
  [[ "$(db_scalar "select status from public.studio2_operation_receipts where operation_id='$S14_POST_EDITION_OPERATION_ID'::uuid;")" == "succeeded" ]] || \
    fail "post_edition operation receipt is missing or not succeeded"

  if db_scalar "update public.studio2_edition_runtime set state='archived' where edition_id='$EDITION_ID'::uuid;" >/dev/null 2>&1; then
    fail "direct database write bypassed the canonical Archive command guard"
  fi
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "post_edition" ]] || \
    fail "rejected direct Archive attempt changed canonical runtime state"

  archive_expected_version="$(db_scalar "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  s14_transition_edition_v3 "$ORGANIZER_A_TOKEN" archived "$S14_ARCHIVE_OPERATION_ID" "$S14_ARCHIVE_IDEMPOTENCY_KEY" "$archive_expected_version"

  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "archived" ]] || \
    fail "canonical edition runtime did not persist archived state"
  legacy_status_after="$(db_scalar "select status::text from public.editions where id='$EDITION_ID'::uuid;")"
  [[ "$legacy_status_after" == "completed" || "$legacy_status_after" == "finished" ]] || \
    fail "legacy public lifecycle compatibility projection did not become terminal"
  [[ "$(db_scalar "select status from public.studio2_operation_receipts where operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid;")" == "succeeded" ]] || \
    fail "archive operation receipt is missing or not succeeded"

  if db_scalar "update public.studio2_edition_runtime set state='post_edition' where edition_id='$EDITION_ID'::uuid;" >/dev/null 2>&1; then
    fail "archived edition runtime was reversible through a direct database write"
  fi
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "archived" ]] || \
    fail "rejected Archive reversal changed canonical runtime state"

  archive_delete_output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; delete from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;" \
    >"$archive_delete_output" 2>&1; then
    cat "$archive_delete_output" >&2
    rm -f "$archive_delete_output"
    fail "service-role archived runtime deletion unexpectedly succeeded"
  fi
  grep -Fq 'Archived edition runtime is irreversible.' "$archive_delete_output" || {
    cat "$archive_delete_output" >&2
    rm -f "$archive_delete_output"
    fail "archived runtime deletion did not fail through the canonical guard"
  }
  rm -f "$archive_delete_output"
  [[ "$(db_scalar "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid and state='archived';")" == "1" ]] || \
    fail "archived runtime fact was deleted or changed"

  archive_event_id="$(db_scalar "select id::text from private.v3_domain_events where edition_id='$EDITION_ID'::uuid and operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid and event_type='edition.archived' limit 1;")"
  [[ -n "$archive_event_id" ]] || fail "canonical edition.archived DomainEvent is missing"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where edition_id='$EDITION_ID'::uuid and operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid and event_type='edition.archived';")" == "1" ]] || \
    fail "archive operation did not emit exactly one canonical edition.archived DomainEvent"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "1" ]] || \
    fail "archive edition.tasks outbox delivery is missing"
  [[ "$(db_scalar "select payload->>'lifecycleAuthority' from private.v3_domain_events where id='$archive_event_id'::uuid;")" == "studio2_edition_runtime" ]] || \
    fail "archive DomainEvent did not bind canonical lifecycle authority"

  domain_event_count_before_replay="$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid and event_type='edition.archived';")"
  legacy_event_count_before_replay="$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$archive_expected_version,\"p_operation_id\":\"$S14_ARCHIVE_OPERATION_ID\",\"p_idempotency_key\":\"$S14_ARCHIVE_IDEMPOTENCY_KEY\"}"
  expect_success "replay exact archive operation"
  expect_json "archive exact retry replays durable receipt" replayed true
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid and event_type='edition.archived';")" == "$domain_event_count_before_replay" ]] || \
    fail "archive exact retry duplicated canonical DomainEvent"
  [[ "$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")" == "$legacy_event_count_before_replay" ]] || \
    fail "archive exact retry duplicated legacy audit evidence"

  # Receipt recovery is actor-scoped, including when the caller is a service.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_reconcile_operation \
    "{\"p_operation_id\":\"$S14_ARCHIVE_OPERATION_ID\"}"
  expect_success "recover Archive through authenticated receipt RPC"
  expect_json "Archive recovered operation" operationId "$S14_ARCHIVE_OPERATION_ID"
  expect_json "Archive recovered status" status succeeded

  claimed_archive_events="$(service_value "select coalesce(string_agg(event_id::text,',' order by event_id::text),'') from public.studio2_claim_domain_event_deliveries('edition.tasks','$S14_ARCHIVE_WORKER_ID',100,60);")"
  printf '%s' "$claimed_archive_events" | tr ',' '\n' | grep -Fxq "$archive_event_id" || \
    fail "archive edition.tasks consequence was not claimable"
  service_value "select public.studio2_process_edition_domain_event('$archive_event_id'::uuid,'edition.tasks','$S14_ARCHIVE_WORKER_ID')::text;" >/dev/null
  [[ "$(db_scalar "select status from private.v3_domain_event_outbox where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "completed" ]] || \
    fail "archive edition.tasks consequence did not complete"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")" == "1" ]] || \
    fail "archive consequence consumer receipt is missing"

  resolved_task_evidence_before_reconcile="$(s14_resolved_task_evidence_hash)"
  service_value "select private.v3_reconcile_resolved_task_notifications('$EDITION_ID'::uuid)::text;" >/dev/null
  resolved_task_evidence_after_reconcile="$(s14_resolved_task_evidence_hash)"
  [[ "$resolved_task_evidence_after_reconcile" == "$resolved_task_evidence_before_reconcile" ]] || \
    fail "resolved-task delivery reconciliation rewrote historical task resolution evidence"

  dead_workflow_tasks="$(db_scalar "
select count(*)
from public.studio2_organizer_tasks task
where task.edition_id='$EDITION_ID'::uuid
  and task.state<>'resolved'
  and private.v3_archive_task_type_is_current_workflow(task.task_type);
")"
  [[ "$dead_workflow_tasks" == "0" ]] || fail "archived edition still has $dead_workflow_tasks impossible current-workflow Organizer tasks"

  unresolved_edition_blockers="$(db_scalar "
select count(*)
from public.studio2_organizer_tasks task
where task.edition_id='$EDITION_ID'::uuid
  and task.task_type='edition.blocker'
  and task.state<>'resolved';
")"
  [[ "$unresolved_edition_blockers" == "0" ]] || fail "archived edition still has $unresolved_edition_blockers unresolved canonical edition.blocker tasks"

  unreconciled_task_notifications="$(db_scalar "
select count(*)
from public.admin_notifications notification
join public.studio2_organizer_tasks task on task.source_key=notification.source_key
where task.edition_id='$EDITION_ID'::uuid
  and task.state='resolved'
  and (notification.requires_action or notification.resolved_at is null);
")"
  [[ "$unreconciled_task_notifications" == "0" ]] || \
    fail "archived edition has $unreconciled_task_notifications resolved-task notifications still claiming action"

  deliverable_resolved_task_notifications="$(db_scalar "
select count(*)
from public.notification_deliveries delivery
join public.studio2_organizer_tasks task on delivery.subject_id=task.id::text
where task.edition_id='$EDITION_ID'::uuid
  and task.state='resolved'
  and delivery.category='organizer_tasks'
  and delivery.status in ('pending','processing');
")"
  [[ "$deliverable_resolved_task_notifications" == "0" ]] || \
    fail "archived edition has $deliverable_resolved_task_notifications deliverable notifications for resolved Organizer tasks"

  result_hash_after="$(s14_result_evidence_hash)"
  publication_hash_after="$(s14_publication_evidence_hash)"
  receipt_ids_after="$(s14_receipt_ids)"
  [[ "$result_hash_after" == "$result_hash_before" ]] || fail "archive mutated immutable result-version history"
  [[ "$publication_hash_after" == "$publication_hash_before" ]] || fail "archive mutated exact publication provenance"
  assert_receipts_retained "$receipt_ids_before" "$receipt_ids_after"

  assert_anonymous_result_matches_version "$SEMI_ONE_ID" "$SEMI_ONE_RESULT_VERSION"
  assert_anonymous_result_matches_version "$SEMI_TWO_ID" "$SEMI_TWO_RESULT_VERSION"
  assert_anonymous_result_matches_version "$FINAL_ID" "$FINAL_RESULT_VERSION"

  run_s14_supabase_outage_injection

  log "S14_INVARIANT_TASKS_COMPLETE"
  log "S14_INVARIANT_NOTIFICATIONS_COMPLETE"
  log "S14_STAGE_10_ARCHIVE_COMPLETE"
}
