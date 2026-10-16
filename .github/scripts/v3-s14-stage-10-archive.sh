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

run_s14_stage_10_archive() {
  log "Stage 10/10: archive through canonical lifecycle authority and prove historical evidence + consequence reconciliation"

  for helper in assert_anonymous_result_matches_version; do
    declare -F "$helper" >/dev/null || fail "Stage 10 requires Stage 9 helper '$helper' to be sourced first"
  done

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Do not fake a lifecycle fast-forward. The completed contest chain must have
  # moved the edition runtime to results before Stage 10 is allowed to execute.
  runtime_state="$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  [[ "$runtime_state" == "results" ]] || fail "S14 Stage 10 requires canonical edition runtime state=results, got '$runtime_state'"

  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and version=2;")" == "3" ]] || fail "Stage 10 requires immutable result version 2 for all three shows"
  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and state='public' and source_result_version=2;")" == "3" ]] || fail "Stage 10 requires all three shows publicly bound to result version 2"

  result_hash_before="$(s14_result_evidence_hash)"
  publication_hash_before="$(s14_publication_evidence_hash)"
  receipt_ids_before="$(s14_receipt_ids)"
  [[ -n "$result_hash_before" && -n "$publication_hash_before" ]] || fail "Stage 10 could not snapshot pre-archive historical evidence"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v2 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"post_edition\",\"p_reason\":null,\"p_approval_request_id\":null}"
  expect_success "transition S14 edition results -> post_edition"
  expect_json "S14 edition reached post_edition" state post_edition

  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v2 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null}"
  expect_success "transition S14 edition post_edition -> archived"
  expect_json "S14 edition reached archived" state archived

  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "archived" ]] || fail "canonical edition runtime did not persist archived state"
  [[ "$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.state_changed' and payload->>'to'='archived';")" -ge "1" ]] || fail "legacy lifecycle evidence for archived transition is missing"

  # #678 is a hard release boundary. The V3 System contract must bridge archive
  # into canonical DomainEvents/outbox consequences. The current legacy-only
  # state change is explicitly insufficient for Stage 10 certification.
  archive_domain_events="$(db_scalar "select count(*) from private.v3_domain_events where edition_id='$EDITION_ID'::uuid and event_type='edition.archived';")"
  [[ "$archive_domain_events" == "1" ]] || fail "S14 Stage 10 blocked by #678: expected exactly one canonical edition.archived DomainEvent, got $archive_domain_events"

  # Consume the canonical Organizer task/notification reconcilers. System #678
  # must make archived canonical state resolve obsolete work; QA never deletes or
  # manually marks these projections complete.
  db_exec "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);"

  open_tasks="$(db_scalar "select count(*) from public.studio2_organizer_tasks where edition_id='$EDITION_ID'::uuid and state<>'resolved';")"
  [[ "$open_tasks" == "0" ]] || fail "archived edition still has $open_tasks actionable Organizer tasks"

  actionable_task_notifications="$(db_scalar "
select count(*)
from public.admin_notifications notification
join public.studio2_organizer_tasks task on task.source_key=notification.source_key
where task.edition_id='$EDITION_ID'::uuid
  and notification.requires_action
  and notification.resolved_at is null;
")"
  [[ "$actionable_task_notifications" == "0" ]] || fail "archived edition still has $actionable_task_notifications actionable task notifications"

  pending_task_deliveries="$(db_scalar "
select count(*)
from public.notification_deliveries delivery
join public.studio2_organizer_tasks task on delivery.subject_id=task.id::text
where task.edition_id='$EDITION_ID'::uuid
  and delivery.category='organizer_tasks'
  and delivery.status in ('pending','processing','failed');
")"
  [[ "$pending_task_deliveries" == "0" ]] || fail "archived edition still has $pending_task_deliveries deliverable Organizer-task notifications"

  result_hash_after="$(s14_result_evidence_hash)"
  publication_hash_after="$(s14_publication_evidence_hash)"
  receipt_ids_after="$(s14_receipt_ids)"
  [[ "$result_hash_after" == "$result_hash_before" ]] || fail "archive mutated immutable result-version history"
  [[ "$publication_hash_after" == "$publication_hash_before" ]] || fail "archive mutated exact publication provenance"
  assert_receipts_retained "$receipt_ids_before" "$receipt_ids_after"

  # Archived history remains publicly reproducible from the same exact result
  # snapshots that were exposed before archive.
  assert_anonymous_result_matches_version "$SEMI_ONE_ID" 2
  assert_anonymous_result_matches_version "$SEMI_TWO_ID" 2
  assert_anonymous_result_matches_version "$FINAL_ID" 2

  log "S14_INVARIANT_TASKS_COMPLETE"
  log "S14_INVARIANT_NOTIFICATIONS_COMPLETE"
  log "S14_STAGE_10_ARCHIVE_COMPLETE"
}
