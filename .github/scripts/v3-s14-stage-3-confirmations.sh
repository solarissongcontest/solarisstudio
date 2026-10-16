#!/usr/bin/env bash
set -euo pipefail

apply_confirmation_round_change() {
  local change_kind="$1" payload_json="$2" operation_id="$3" idempotency_key="$4"
  local version
  version="$(db_scalar "select version from public.studio2_confirmation_round_versions where round_id='$CONFIRMATION_ROUND_ID'::uuid;")"
  [[ -n "$version" ]] || fail "confirmation round version is missing"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_confirmation_round_change "{\"p_round_id\":\"$CONFIRMATION_ROUND_ID\",\"p_change_kind\":\"$change_kind\",\"p_payload\":$payload_json,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$version}"
  expect_success "governed confirmation round $change_kind"
  expect_json "governed confirmation round $change_kind accepted" ok true
}

run_s14_stage_3_confirmations() {
  log "Stage 3/10: confirmations, decline, receipt recovery, correction, close and reopen"

  FIRST_BODY=''
  FIRST_OPERATION_ID=''
  FIRST_SESSION=''
  FIRST_SUBMISSION_ID=''

  for i in $(seq 1 66); do
    suffix="$(printf '%012d' "$i")"
    operation_id="14000000-0000-4002-8000-$suffix"
    session_id="s14-confirmation-$(printf '%02d' "$i")"
    country_name="S14 Delegation $(printf '%02d' "$i")"
    username="s14_hod_$(printf '%02d' "$i")"
    if (( i >= 65 )); then participating=false; else participating=true; fi

    body="$(python3 - "$CONFIRMATION_ROUND_ID" "$session_id" "$username" "$country_name" "$participating" "$operation_id" <<'PY'
import json, sys
round_id, session, username, country, participating, operation_id = sys.argv[1:]
payload = {
    "round_id": round_id,
    "browser_session_id": session,
    "instagram_username": username,
    "country": country,
    "country_account": country,
    "has_country_account": True,
    "participating": participating == "true",
    "selection_method": "unknown" if participating == "true" else "",
    "entry_unknown": participating == "true",
    "nf_entries_unknown": False,
}
print(json.dumps({
    "payload": payload,
    "_idempotency_key": operation_id,
    "_request_hash": "caller-hash-is-not-authority",
    "_browser_session_id": session,
}, separators=(",", ":")))
PY
)"

    rpc_request "$ANON_KEY" v3_submit_confirmation "$body"
    expect_success "confirmation submit $(printf '%02d' "$i")"
    expect_json "confirmation submit $(printf '%02d' "$i") accepted" ok true
    expect_json "confirmation submit $(printf '%02d' "$i") is first acceptance" receipt.replayed false

    submission_id="$(printf '%s' "$HTTP_BODY" | json_value submission_id)"
    [[ -n "$submission_id" ]] || fail "confirmation $(printf '%02d' "$i") returned no submission id"

    if (( i == 1 )); then
      FIRST_BODY="$body"
      FIRST_OPERATION_ID="$operation_id"
      FIRST_SESSION="$session_id"
      FIRST_SUBMISSION_ID="$submission_id"
    fi
  done

  [[ "$(db_scalar "select count(*) from public.submissions where round_id='$CONFIRMATION_ROUND_ID'::uuid;")" == "66" ]] || fail "confirmation stage did not create exactly 66 canonical submissions"
  [[ "$(db_scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID'::uuid and superseded_at is null and status='satisfied';")" == "64" ]] || fail "64 participating confirmations did not satisfy their canonical requirements"
  [[ "$(db_scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID'::uuid and superseded_at is null and status='waived';")" == "2" ]] || fail "two decline confirmations did not waive their canonical requirements"

  # Simulate a lost HTTP response after commit by ignoring the original response
  # and recovering only from the canonical receipt endpoint.
  rpc_request "$ANON_KEY" v3_reconcile_confirmation "{\"_idempotency_key\":\"$FIRST_OPERATION_ID\",\"_browser_session_id\":\"$FIRST_SESSION\"}"
  expect_success "post-commit confirmation recovery"
  expect_json "post-commit confirmation recovery found operation" found true
  expect_json "post-commit confirmation recovery is a replay" result.receipt.replayed true
  log "S14_FAILURE_NETWORK_AFTER_COMMIT_COMPLETE"

  # An exact retry must return the same receipt instead of manufacturing a
  # second canonical response.
  rpc_request "$ANON_KEY" v3_submit_confirmation "$FIRST_BODY"
  expect_success "exact confirmation duplicate request"
  expect_json "duplicate confirmation request replayed" receipt.replayed true
  [[ "$(db_scalar "select count(*) from private.v3_confirmation_operations where idempotency_key='$FIRST_OPERATION_ID'::uuid;")" == "1" ]] || fail "duplicate request created more than one canonical confirmation operation"
  [[ "$(db_scalar "select count(*) from public.submissions where id='$FIRST_SUBMISSION_ID'::uuid;")" == "1" ]] || fail "duplicate request created more than one canonical submission"
  log "S14_FAILURE_DUPLICATE_REQUEST_COMPLETE"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Close through the governed operation contract, prove a late submit is
  # rejected without a completed S2 operation, then reopen the same round.
  apply_confirmation_round_change status '{"status":"closed"}' '14000000-0000-4003-8000-000000000001' 's14-confirmation-close'

  LATE_OPERATION_ID='14000000-0000-4003-8000-000000000002'
  LATE_SESSION='s14-confirmation-late'
  rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$CONFIRMATION_ROUND_ID\",\"browser_session_id\":\"$LATE_SESSION\",\"instagram_username\":\"late_s14\",\"country\":\"S14 Too Late\",\"participating\":false},\"_idempotency_key\":\"$LATE_OPERATION_ID\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$LATE_SESSION\"}"
  expect_success "closed-window confirmation returns structured rejection"
  expect_json "closed-window confirmation rejected" ok false
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$LATE_OPERATION_ID'::uuid;")" == "0" ]] || fail "closed-window rejection created a completed S2 operation"

  apply_confirmation_round_change status '{"status":"open"}' '14000000-0000-4003-8000-000000000003' 's14-confirmation-reopen'

  # Reopening the round must make an existing response editable through the
  # canonical round-editing command before a correction is accepted.
  if [[ "$(db_scalar "select editing_allowed::text from public.submissions where id='$FIRST_SUBMISSION_ID'::uuid;")" != "true" ]]; then
    apply_confirmation_round_change editing '{"editingEnabled":false}' '14000000-0000-4003-8000-000000000004' 's14-confirmation-editing-off'
    apply_confirmation_round_change editing '{"editingEnabled":true}' '14000000-0000-4003-8000-000000000005' 's14-confirmation-editing-on'
  fi
  [[ "$(db_scalar "select editing_allowed::text from public.submissions where id='$FIRST_SUBMISSION_ID'::uuid;")" == "true" ]] || fail "reopened confirmation did not become editable through the governed round contract"

  CORRECTION_OPERATION_ID='14000000-0000-4003-8000-000000000006'
  CORRECTION_SESSION='s14-confirmation-01-correction'
  CORRECTION_BODY="$(python3 - "$CONFIRMATION_ROUND_ID" "$CORRECTION_SESSION" "$CORRECTION_OPERATION_ID" <<'PY'
import json, sys
round_id, session, operation_id = sys.argv[1:]
payload = {
    "round_id": round_id,
    "browser_session_id": session,
    "instagram_username": "s14_hod_01_corrected",
    "country": "S14 Delegation 01",
    "country_account": "S14 Delegation 01",
    "has_country_account": True,
    "participating": True,
    "selection_method": "unknown",
    "entry_unknown": True,
    "nf_entries_unknown": False,
}
print(json.dumps({"payload":payload,"_idempotency_key":operation_id,"_request_hash":"ignored","_browser_session_id":session}, separators=(",", ":")))
PY
)"
  rpc_request "$ANON_KEY" v3_submit_confirmation "$CORRECTION_BODY"
  expect_success "confirmation correction"
  expect_json "confirmation correction accepted" ok true
  [[ "$(printf '%s' "$HTTP_BODY" | json_value submission_id)" == "$FIRST_SUBMISSION_ID" ]] || fail "correction replaced the canonical submission identity"
  [[ "$(db_scalar "select edit_count from public.submissions where id='$FIRST_SUBMISSION_ID'::uuid;")" -ge 1 ]] || fail "correction did not increment canonical edit count"
  [[ "$(db_scalar "select count(*) from public.submission_versions where submission_id='$FIRST_SUBMISSION_ID'::uuid;")" -ge 1 ]] || fail "correction did not preserve immutable prior response evidence"

  # The correction consumes editability. A stale client trying a fresh mutation
  # without another governed reopen must receive a structured rejection.
  STALE_OPERATION_ID='14000000-0000-4003-8000-000000000007'
  STALE_SESSION='s14-confirmation-01-stale'
  rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$CONFIRMATION_ROUND_ID\",\"browser_session_id\":\"$STALE_SESSION\",\"instagram_username\":\"stale_s14\",\"country\":\"S14 Delegation 01\",\"participating\":true,\"selection_method\":\"unknown\",\"entry_unknown\":true},\"_idempotency_key\":\"$STALE_OPERATION_ID\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$STALE_SESSION\"}"
  expect_success "stale confirmation client receives canonical result"
  expect_json "stale confirmation client rejected" ok false
  expect_json "stale confirmation client rejection is duplicate/locked" error duplicate
  log "S14_FAILURE_STALE_CLIENT_COMPLETE"

  # Effective requirement uniqueness must survive the whole submit/correct/reopen
  # sequence. The partial unique index is not enough evidence on its own; verify
  # the concrete rehearsal state as well.
  [[ "$(db_scalar "select count(*) from (select edition_id,country_id,count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID'::uuid and superseded_at is null group by edition_id,country_id having count(*)<>1) x;")" == "0" ]] || fail "effective confirmation requirements are duplicated or missing"
  [[ "$(db_scalar "select count(*) from public.submissions where round_id='$CONFIRMATION_ROUND_ID'::uuid;")" == "66" ]] || fail "confirmation correction changed the canonical response cardinality"
  log "S14_INVARIANT_CONFIRMATION_COMPLETE"

  apply_confirmation_round_change status '{"status":"closed"}' '14000000-0000-4003-8000-000000000008' 's14-confirmation-final-close'
  log "S14_STAGE_3_CONFIRMATIONS_COMPLETE"
}
