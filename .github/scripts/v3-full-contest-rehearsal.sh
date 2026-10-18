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

OUTPUT_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
mkdir -p "$OUTPUT_DIR"
PARTIAL_PATH="$OUTPUT_DIR/s14-full-contest.partial.json"
EVIDENCE_WRITTEN=0
CURRENT_STAGE="bootstrap"
COMPLETED_STAGES=()
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

write_runtime_failure_evidence() {
  local exit_code="$1"
  python3 - "$PARTIAL_PATH" "$CANDIDATE_SHA" "$CURRENT_STAGE" "$exit_code" "${COMPLETED_STAGES[*]}" <<'PY'
import json, sys
path, sha, failure_stage, exit_code, completed_text = sys.argv[1:]
completed = completed_text.split() if completed_text else []
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
pending = [stage for stage in all_stages if stage not in completed]
payload = {
    "schemaVersion": 2,
    "candidateSha": sha,
    "passed": False,
    "partial": True,
    "runtimeFailure": True,
    "failureStage": failure_stage,
    "exitCode": int(exit_code),
    "completedStages": completed,
    "pendingStages": pending,
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
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

run_stage stage-1-setup run_s14_stage_1_setup
run_stage stage-2-delegation-onboarding run_s14_stage_2_onboarding
run_stage stage-3-confirmations run_s14_stage_3_confirmations
run_stage stage-4-entries run_s14_stage_4_entries
run_stage stage-5-running-orders run_s14_stage_5_running_orders
run_stage stage-6-jury run_s14_stage_6_jury
run_stage stage-7-public-voting run_s14_stage_7_public_voting

PENDING_STAGES=(
  stage-8-results
  stage-9-publication
  stage-10-archive
)

python3 - "$PARTIAL_PATH" "$CANDIDATE_SHA" "${PENDING_STAGES[@]}" <<'PY'
import json, sys
path, sha, *pending = sys.argv[1:]
payload = {
    "schemaVersion": 2,
    "candidateSha": sha,
    "passed": False,
    "partial": True,
    "runtimeFailure": False,
    "completedStages": [
        "stage-1-setup",
        "stage-2-delegation-onboarding",
        "stage-3-confirmations",
        "stage-4-entries",
        "stage-5-running-orders",
        "stage-6-jury",
        "stage-7-public-voting",
    ],
    "implementedInvariants": [
        "confirmation-no-effective-duplicates",
        "entry-valid-revision",
        "media-accepted-revision",
        "jury-single-final-ballot",
        "televote-canonical-ballot",
    ],
    "implementedFailureInjections": [
        "network-after-commit",
        "duplicate-request",
        "stale-client",
        "two-organizers",
    ],
    "pendingStages": pending,
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
EVIDENCE_WRITTEN=1

if [[ "${V3_S14_ALLOW_PARTIAL:-0}" == "1" ]]; then
  log "Partial S14 harness passed through Stage 7; release-grade S14 remains blocked by ${#PENDING_STAGES[@]} stages."
  exit 0
fi

fail "S14 is intentionally incomplete: ${PENDING_STAGES[*]}. No release-grade s14-full-contest.json was written."
