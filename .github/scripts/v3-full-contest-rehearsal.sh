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

run_s14_stage_1_setup
run_s14_stage_2_onboarding
run_s14_stage_3_confirmations
run_s14_stage_4_entries
run_s14_stage_5_running_orders
run_s14_stage_6_jury
run_s14_stage_7_public_voting_supported_cases

PENDING_STAGES=(
  stage-7-public-voting
  stage-8-results
  stage-9-publication
  stage-10-archive
)

OUTPUT_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
mkdir -p "$OUTPUT_DIR"
PARTIAL_PATH="$OUTPUT_DIR/s14-full-contest.partial.json"
python3 - "$PARTIAL_PATH" "$CANDIDATE_SHA" "${PENDING_STAGES[@]}" <<'PY'
import json, sys
path, sha, *pending = sys.argv[1:]
payload = {
    "schemaVersion": 2,
    "candidateSha": sha,
    "passed": False,
    "partial": True,
    "completedStages": [
        "stage-1-setup",
        "stage-2-delegation-onboarding",
        "stage-3-confirmations",
        "stage-4-entries",
        "stage-5-running-orders",
        "stage-6-jury",
    ],
    "supportedPendingStageEvidence": ["stage-7-public-voting"],
    "implementedInvariants": [
        "confirmation-no-effective-duplicates",
        "entry-valid-revision",
        "media-accepted-revision",
        "jury-single-final-ballot",
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

if [[ "${V3_S14_ALLOW_PARTIAL:-0}" == "1" ]]; then
  log "Partial S14 harness passed through Stage 6 plus supported Stage 7 cases; release-grade S14 remains blocked by ${#PENDING_STAGES[@]} stages."
  exit 0
fi

fail "S14 is intentionally incomplete: ${PENDING_STAGES[*]}. No release-grade s14-full-contest.json was written."
