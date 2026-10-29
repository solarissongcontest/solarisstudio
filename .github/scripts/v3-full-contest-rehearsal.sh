#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# The driver is intentionally modular but stateful: every stage is sourced into
# this process and operates on the same local Supabase contest. No stage may
# reset the database or substitute a focused isolated rehearsal.
source "$SCRIPT_DIR/v3-s14-lib.sh"
source "$SCRIPT_DIR/v3-s14-stage-1-setup.sh"
source "$SCRIPT_DIR/v3-s14-stage-2-onboarding.sh"
source "$SCRIPT_DIR/v3-s14-stage-3-confirmations.sh"
source "$SCRIPT_DIR/v3-s14-stage-4-entries.sh"
source "$SCRIPT_DIR/v3-s14-stage-5-running-orders.sh"
source "$SCRIPT_DIR/v3-s14-stage-6-jury.sh"
source "$SCRIPT_DIR/v3-s14-stage-7-public-voting.sh"
source "$SCRIPT_DIR/v3-s14-stage-7-genuine-deadline.sh"
source "$SCRIPT_DIR/v3-s14-stage-7-deterministic-fixture.sh"
source "$SCRIPT_DIR/v3-s14-stage-7-open-diagnostics.sh"
source "$SCRIPT_DIR/v3-s14-stage-7-diagnostics.sh"
source "$SCRIPT_DIR/v3-s14-stage-8-results.sh"
source "$SCRIPT_DIR/v3-s14-stage-9-publication.sh"
source "$SCRIPT_DIR/v3-s14-grand-final-leg.sh"
source "$SCRIPT_DIR/v3-s14-grand-final-voting.sh"
source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"
source "$SCRIPT_DIR/v3-s14-grand-final-publication.sh"
source "$SCRIPT_DIR/v3-s14-stage-10-archive.sh"

OUTPUT_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
mkdir -p "$OUTPUT_DIR"
PARTIAL_PATH="$OUTPUT_DIR/s14-full-contest.partial.json"
FINAL_PATH="$OUTPUT_DIR/s14-full-contest.json"
rm -f "$PARTIAL_PATH" "$FINAL_PATH"
EVIDENCE_WRITTEN=0
CURRENT_STAGE="bootstrap"
COMPLETED_STAGES=()
COMPLETED_CONTEST_EXTENSIONS=()
ALL_STAGES=(
  stage-1-setup
  stage-2-delegation-onboarding
  stage-3-confirmations
  stage-4-entries
  stage-5-running-orders
  stage-6-jury
  stage-7-public-voting
  stage-8-results
  stage-9-publication
  stage-10-archive
)
ALL_CONTEST_EXTENSIONS=(
  grand-final-qualifier-bridge
  grand-final-voting
  grand-final-results
  grand-final-publication
)
S14_RESULTS_RECONCILE_OPERATION_ID='14000000-0000-4000-8000-000000000089'
S14_RESULTS_RECONCILE_IDEMPOTENCY_KEY='s14-full-contest-results-v3'
S14_RUN_ID="${V3_S14_RUN_ID:-s14-${CANDIDATE_SHA:-unknown}}"
DATABASE_FINGERPRINT=''

write_runtime_failure_evidence() {
  local exit_code="$1"
  python3 - "$PARTIAL_PATH" "$CANDIDATE_SHA" "$CURRENT_STAGE" "$exit_code" "${COMPLETED_STAGES[*]}" "${COMPLETED_CONTEST_EXTENSIONS[*]}" "${EDITION_ID:-}" "$S14_RUN_ID" "$DATABASE_FINGERPRINT" <<'PY'
import json, sys
(
    path,
    sha,
    failure_stage,
    exit_code,
    completed_text,
    completed_extensions_text,
    edition_id,
    run_id,
    database_fingerprint,
) = sys.argv[1:]
completed = completed_text.split() if completed_text else []
completed_extensions = completed_extensions_text.split() if completed_extensions_text else []
all_stages = [
    "stage-1-setup",
    "stage-2-delegation-onboarding",
    "stage-3-confirmations",
    "stage-4-entries",
    "stage-5-running-orders",
    "stage-6-jury",
    "stage-7-public-voting",
    "stage-8-results",
    "stage-9-publication",
    "stage-10-archive",
]
all_extensions = [
    "grand-final-qualifier-bridge",
    "grand-final-voting",
    "grand-final-results",
    "grand-final-publication",
]

def canonical_failure_phase(detail):
    if detail == "bootstrap":
        return "bootstrap"
    for phase in [*all_stages, *all_extensions, "results-runtime-reconciliation"]:
        if detail == phase or detail.startswith(f"{phase}:"):
            return phase
    return "unknown"

failure_phase = canonical_failure_phase(failure_stage)
pending = [stage for stage in all_stages if stage not in completed]
pending_extensions = [extension for extension in all_extensions if extension not in completed_extensions]
payload = {
    "schemaVersion": 3,
    "candidateSha": sha,
    "passed": False,
    "partial": True,
    "runtimeFailure": True,
    "failurePhase": failure_phase,
    "failureStage": failure_stage,
    "exitCode": int(exit_code),
    "completedStages": completed,
    "completedContestExtensions": completed_extensions,
    "pendingStages": pending,
    "pendingContestExtensions": pending_extensions,
    "blockedContestExtensions": [],
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
    "runIdentity": {
        "runId": run_id,
        "editionId": edition_id or None,
        "databaseFingerprint": database_fingerprint or None,
        "candidateSha": sha,
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
  EVIDENCE_WRITTEN=1
}

on_exit() {
  local status="$?"
  if (( status != 0 )) && [[ "$EVIDENCE_WRITTEN" != "1" ]]; then
    write_runtime_failure_evidence "$status" || true
  fi
}
trap on_exit EXIT

run_stage() {
  local stage_id="$1" function_name="$2"
  CURRENT_STAGE="$stage_id"
  "$function_name"
  COMPLETED_STAGES+=("$stage_id")
}

run_contest_extension() {
  local extension_id="$1" function_name="$2"
  CURRENT_STAGE="$extension_id"
  "$function_name"
  COMPLETED_CONTEST_EXTENSIONS+=("$extension_id")
}

assert_same_persistent_contest() {
  local current_fingerprint current_edition_count
  current_fingerprint="$(db_scalar "select current_database() || ':' || pg_postmaster_start_time()::text;")"
  [[ -n "$DATABASE_FINGERPRINT" ]] || fail "S14 persistent database fingerprint was not captured"
  [[ "$current_fingerprint" == "$DATABASE_FINGERPRINT" ]] || \
    fail "S14 database identity changed during the persistent contest rehearsal"
  current_edition_count="$(db_scalar "select count(*) from public.editions where id='$EDITION_ID'::uuid;")"
  [[ "$current_edition_count" == "1" ]] || fail "S14 contest edition identity disappeared or changed"
}

promote_semifinal_results_to_v2() {
  log "Stage 8 persistence adapter: recalculate both semifinal Results through canonical authority and prove immutable base=next"

  local show_id show_ordinal version base_version next_version unlock_id calculate_id review_id lock_id reveal_id reproducible lifecycle
  show_ordinal=0
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_ordinal=$((show_ordinal+1))
    version="$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    [[ "$version" =~ ^[1-9][0-9]*$ ]] || fail "S14 semifinal $show_id has invalid persisted Results version '$version'"
    base_version="$version"
    next_version=$((base_version+1))
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=$base_version and result_row_count>0;")" == "1" ]] || \
      fail "S14 semifinal $show_id has no retained non-empty immutable Results base version $base_version"

    unlock_id="14000000-0000-4008-8700-$(printf '%012d' "$show_ordinal")"
    calculate_id="14000000-0000-4008-8800-$(printf '%012d' "$show_ordinal")"
    review_id="14000000-0000-4008-8900-$(printf '%012d' "$show_ordinal")"
    lock_id="14000000-0000-4008-9000-$(printf '%012d' "$show_ordinal")"
    reveal_id="14000000-0000-4008-9100-$(printf '%012d' "$show_ordinal")"

    execute_result_action "$show_id" unlock "$unlock_id" "$version" "S14 unlock immutable semifinal result before reproducibility recalculation"
    execute_result_action "$show_id" calculate "$calculate_id" "$version" "S14 reproducibility recalculation for immutable semifinal Results next version $next_version"
    version="$(printf '%s' "$HTTP_BODY" | json_value calculationVersion)"
    [[ "$version" == "$next_version" ]] || fail "S14 semifinal $show_id reproducibility calculation did not advance Results version exactly once"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=$next_version and result_row_count>0;")" == "1" ]] || \
      fail "S14 semifinal $show_id did not retain non-empty immutable Results next version $next_version"

    reproducible="$(db_scalar "
select (
  v1.result_rows = v2.result_rows
  and v1.result_row_count = v2.result_row_count
)::text
from private.v3_result_versions v1
join private.v3_result_versions v2
  on v2.show_id=v1.show_id and v2.version=$next_version
where v1.show_id='$show_id'::uuid and v1.version=$base_version;
")"
    [[ "$reproducible" == "true" ]] || fail "S14 semifinal $show_id Results next version $next_version does not exactly reproduce retained immutable base version $base_version"
    verify_result_snapshot_matches_current "$show_id" "$next_version"

    execute_result_action "$show_id" review "$review_id" "$next_version" "S14 validate reproducible semifinal Results next version $next_version"
    execute_result_action "$show_id" lock "$lock_id" "$next_version" "S14 lock reproducible semifinal Results next version $next_version"
    execute_result_action "$show_id" mark_reveal_ready "$reveal_id" "$next_version" "S14 approve reproducible semifinal Results next version $next_version for reveal"

    lifecycle="$(db_scalar "select calculation_version::text || ':' || reviewed_version::text || ':' || locked_version::text || ':' || reveal_ready_version::text from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    [[ "$lifecycle" == "$next_version:$next_version:$next_version:$next_version" ]] || fail "S14 semifinal $show_id lifecycle did not finalize exact Results version $next_version ($lifecycle)"
    if [[ "$show_id" == "$SEMI_ONE_ID" ]]; then
      SEMI_ONE_RESULT_VERSION="$next_version"
    else
      SEMI_TWO_RESULT_VERSION="$next_version"
    fi
  done

  log "S14_RESULTS_VERSION_2_COMPLETE"
}

run_s14_stage_8_results_persistent() {
  run_s14_stage_8_results
  promote_semifinal_results_to_v2
}

reconcile_edition_runtime_to_results() {
  log "Reconcile the same persistent edition runtime to results from exact final publication evidence"
  CURRENT_STAGE="results-runtime-reconciliation"
  assert_same_persistent_contest

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  [[ "$(db_scalar "select private.v3_edition_final_results_ready('$EDITION_ID'::uuid)::text;")" == "true" ]] || \
    fail "canonical final-results readiness is false after Grand Final publication"
  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and version=(case show_id when '$SEMI_ONE_ID'::uuid then $SEMI_ONE_RESULT_VERSION when '$SEMI_TWO_ID'::uuid then $SEMI_TWO_RESULT_VERSION else $FINAL_RESULT_VERSION end) and result_row_count>0;")" == "3" ]] || \
    fail "results-runtime reconciliation requires non-empty immutable captured Results versions for all three shows"
  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid,'$FINAL_ID'::uuid) and state='public' and source_result_version=(case show_id when '$SEMI_ONE_ID'::uuid then $SEMI_ONE_RESULT_VERSION when '$SEMI_TWO_ID'::uuid then $SEMI_TWO_RESULT_VERSION else $FINAL_RESULT_VERSION end);")" == "3" ]] || \
    fail "results-runtime reconciliation requires all three public result pointers to exact captured versions"

  local expected_version prior_state result_version event_count_before replay_event_count
  prior_state="$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  expected_version="$(db_scalar "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
  [[ -n "$prior_state" && "$expected_version" =~ ^[1-9][0-9]*$ ]] || fail "canonical edition runtime is missing before Results reconciliation"

  event_count_before="$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.state_changed';")"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"results\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$expected_version,\"p_operation_id\":\"$S14_RESULTS_RECONCILE_OPERATION_ID\",\"p_idempotency_key\":\"$S14_RESULTS_RECONCILE_IDEMPOTENCY_KEY\"}"
  expect_success "reconcile S14 edition runtime to results"
  expect_json "S14 edition runtime reached results" state results
  expect_json "S14 Results reconciliation is not a replay on first execution" replayed false

  result_version="$(printf '%s' "$HTTP_BODY" | json_value runtimeVersion)"
  [[ "$result_version" =~ ^[1-9][0-9]*$ ]] || fail "Results reconciliation returned invalid runtimeVersion"
  [[ "$(db_scalar "select state || ':' || version::text from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "results:$result_version" ]] || \
    fail "canonical edition runtime did not persist Results reconciliation"
  [[ "$(db_scalar "select status from public.studio2_operation_receipts where operation_id='$S14_RESULTS_RECONCILE_OPERATION_ID'::uuid;")" == "succeeded" ]] || \
    fail "Results reconciliation operation receipt is missing or not succeeded"
  [[ "$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.state_changed' and payload->>'operationId'='$S14_RESULTS_RECONCILE_OPERATION_ID';")" == "1" ]] || \
    fail "Results reconciliation did not emit exactly one operation-linked lifecycle event"
  [[ "$(db_scalar "select payload->>'reconciledFromFinalPublication' from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.state_changed' and payload->>'operationId'='$S14_RESULTS_RECONCILE_OPERATION_ID' limit 1;")" == "true" ]] || \
    fail "Results lifecycle event is not explicitly bound to final publication readiness"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v3 \
    "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"results\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$expected_version,\"p_operation_id\":\"$S14_RESULTS_RECONCILE_OPERATION_ID\",\"p_idempotency_key\":\"$S14_RESULTS_RECONCILE_IDEMPOTENCY_KEY\"}"
  expect_success "replay exact S14 Results reconciliation"
  expect_json "S14 Results reconciliation exact retry replays durable receipt" replayed true
  replay_event_count="$(db_scalar "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.state_changed';")"
  [[ "$replay_event_count" == "$((event_count_before+1))" ]] || fail "Results reconciliation exact retry duplicated lifecycle audit evidence"
  # Receipt recovery is actor-scoped, including when the caller is a service.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_reconcile_operation \
    "{\"p_operation_id\":\"$S14_RESULTS_RECONCILE_OPERATION_ID\"}"
  expect_success "recover Results reconciliation through authenticated receipt RPC"
  expect_json "Results reconciliation recovered operation" operationId "$S14_RESULTS_RECONCILE_OPERATION_ID"
  expect_json "Results reconciliation recovered status" status succeeded

  assert_same_persistent_contest
  log "S14_RESULTS_RUNTIME_RECONCILIATION_COMPLETE"
}

write_final_evidence() {
  assert_same_persistent_contest

  local result_hash publication_hash receipt_count archive_event_id archive_outbox_key archive_consumer_receipt_count
  result_hash="$(s14_result_evidence_hash)"
  publication_hash="$(s14_publication_evidence_hash)"
  receipt_count="$(db_scalar "select count(*) from public.studio2_operation_receipts;")"
  archive_event_id="$(db_scalar "select id::text from private.v3_domain_events where operation_id='$S14_ARCHIVE_OPERATION_ID'::uuid and event_type='edition.archived' limit 1;")"
  archive_outbox_key="$(db_scalar "select event_id::text || ':' || consumer_key from private.v3_domain_event_outbox where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks' and status='completed' limit 1;")"
  archive_consumer_receipt_count="$(db_scalar "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$archive_event_id'::uuid and consumer_key='edition.tasks';")"

  [[ -n "$result_hash" && -n "$publication_hash" && -n "$archive_event_id" && -n "$archive_outbox_key" ]] || \
    fail "release-grade S14 evidence is missing retained Results/publication/Archive provenance"
  [[ "$archive_consumer_receipt_count" == "1" ]] || fail "release-grade S14 evidence requires exactly one Archive consequence consumer receipt"

  python3 - "$FINAL_PATH" "$CANDIDATE_SHA" "$S14_RUN_ID" "$EDITION_ID" "$DATABASE_FINGERPRINT" "$result_hash" "$publication_hash" "$receipt_count" "$S14_RESULTS_RECONCILE_OPERATION_ID" "$S14_POST_EDITION_OPERATION_ID" "$S14_ARCHIVE_OPERATION_ID" "$archive_event_id" "$archive_outbox_key" <<'PY'
import json, sys
(
    path,
    sha,
    run_id,
    edition_id,
    database_fingerprint,
    result_hash,
    publication_hash,
    receipt_count,
    results_operation_id,
    post_edition_operation_id,
    archive_operation_id,
    archive_event_id,
    archive_outbox_key,
) = sys.argv[1:]
payload = {
    "schemaVersion": 3,
    "candidateSha": sha,
    "passed": True,
    "partial": False,
    "runtimeFailure": False,
    "completedStages": [
        "stage-1-setup",
        "stage-2-delegation-onboarding",
        "stage-3-confirmations",
        "stage-4-entries",
        "stage-5-running-orders",
        "stage-6-jury",
        "stage-7-public-voting",
        "stage-8-results",
        "stage-9-publication",
        "stage-10-archive",
    ],
    "pendingStages": [],
    "completedContestExtensions": [
        "grand-final-qualifier-bridge",
        "grand-final-voting",
        "grand-final-results",
        "grand-final-publication",
    ],
    "pendingContestExtensions": [],
    "blockedContestExtensions": [],
    "implementedInvariants": [
        "confirmation-no-effective-duplicates",
        "entry-valid-revision",
        "media-accepted-revision",
        "jury-single-final-ballot",
        "televote-canonical-ballot",
        "result-reproducible",
        "publication-final-version",
        "tasks-canonical",
        "notifications-reconcilable",
    ],
    "implementedFailureInjections": [
        "network-after-commit",
        "db-timeout-before-commit",
        "duplicate-request",
        "worker-crash",
        "realtime-disconnect",
        "stale-client",
        "two-organizers",
        "supabase-outage",
    ],
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
    "runIdentity": {
        "runId": run_id,
        "editionId": edition_id,
        "databaseFingerprint": database_fingerprint,
        "candidateSha": sha,
    },
    "provenance": {
        "resultEvidenceHash": result_hash,
        "publicationEvidenceHash": publication_hash,
        "retainedOperationReceiptCount": int(receipt_count),
    },
    "lifecycle": {
        "resultsOperationId": results_operation_id,
        "postEditionOperationId": post_edition_operation_id,
        "archiveOperationId": archive_operation_id,
        "finalState": "archived",
    },
    "archive": {
        "eventId": archive_event_id,
        # Keep the legacy evidence field as a serialized natural identity.
        "outboxId": archive_outbox_key,
        "outboxKey": {"eventId": archive_event_id, "consumerKey": "edition.tasks"},
        "consequenceConsumerReceiptCount": 1,
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
  EVIDENCE_WRITTEN=1
}

run_stage stage-1-setup run_s14_stage_1_setup
DATABASE_FINGERPRINT="$(db_scalar "select current_database() || ':' || pg_postmaster_start_time()::text;")"
[[ -n "$DATABASE_FINGERPRINT" ]] || fail "could not capture persistent local database fingerprint after S14 setup"
assert_same_persistent_contest

run_stage stage-2-delegation-onboarding run_s14_stage_2_onboarding
run_stage stage-3-confirmations run_s14_stage_3_confirmations
run_stage stage-4-entries run_s14_stage_4_entries
run_stage stage-5-running-orders run_s14_stage_5_running_orders
run_stage stage-6-jury run_s14_stage_6_jury
run_stage stage-7-public-voting run_s14_stage_7_public_voting
run_stage stage-8-results run_s14_stage_8_results_persistent
run_stage stage-9-publication run_s14_stage_9_publication

# Semifinal truth determines the Grand Final. Continue in the same local contest
# through governed qualifier promotion, Jury/Televote, immutable final Results,
# and exact-version public release.
run_contest_extension grand-final-qualifier-bridge prepare_s14_grand_final_from_qualifiers
run_contest_extension grand-final-voting run_s14_grand_final_voting
run_contest_extension grand-final-results run_s14_grand_final_results
run_contest_extension grand-final-publication run_s14_grand_final_publication

reconcile_edition_runtime_to_results
run_stage stage-10-archive run_s14_stage_10_archive

[[ "${#COMPLETED_STAGES[@]}" == "${#ALL_STAGES[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing lifecycle stages"
[[ "${#COMPLETED_CONTEST_EXTENSIONS[@]}" == "${#ALL_CONTEST_EXTENSIONS[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing contest extensions"
[[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "archived" ]] || fail "release-grade S14 evidence requires canonical archived state"

write_final_evidence
log "S14 full persistent contest rehearsal passed through canonical Archive."
