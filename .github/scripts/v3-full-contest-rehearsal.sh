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

seed_s14_runtime() {
  db_exec "
insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_ID'::uuid,'draft',private.studio2_default_subsystems('draft'),1,null)
on conflict (edition_id) do update set
  state='draft',
  subsystems=private.studio2_default_subsystems('draft'),
  version=1,
  updated_by=null,
  updated_at=now();
"
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "draft" ]] || fail "S14 edition runtime did not start in draft"
}

advance_s14_runtime() {
  local target="$1" reason="${2-}" body
  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  body="$(python3 -c 'import json,sys; print(json.dumps({"p_edition_id":sys.argv[1],"p_to":sys.argv[2],"p_reason":sys.argv[3] or None,"p_approval_request_id":None}))' "$EDITION_ID" "$target" "$reason")"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_transition_edition_v2 "$body"
  expect_success "advance S14 edition runtime to $target"
  expect_json "S14 edition runtime reached $target" state "$target"
  [[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "$target" ]] || fail "S14 edition runtime database state did not reach $target"
}

run_s14_stage_1_setup
seed_s14_runtime

run_s14_stage_2_onboarding
advance_s14_runtime planning
advance_s14_runtime confirmations

run_s14_stage_3_confirmations
advance_s14_runtime submissions

run_s14_stage_4_entries
advance_s14_runtime pre_show

run_s14_stage_5_running_orders
advance_s14_runtime rehearsals
advance_s14_runtime jury_voting

run_s14_stage_6_jury
advance_s14_runtime live_show
advance_s14_runtime televoting

run_s14_stage_7_public_voting_supported_cases

# Stage 7 deliberately remains incomplete until the canonical deadline-extension
# authority exists. Therefore runtime must remain in televoting instead of
# pretending the contest has reached vote verification.
[[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == "televoting" ]] || fail "partial S14 must remain in televoting while Stage 7 is blocked"

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
    "runtimeState": "televoting",
    "pendingStages": pending,
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY

if [[ "${V3_S14_ALLOW_PARTIAL:-0}" == "1" ]]; then
  log "Partial S14 harness passed through Stage 6 and supported Stage 7 cases; release-grade S14 remains blocked by ${#PENDING_STAGES[@]} stages."
  exit 0
fi

fail "S14 is intentionally incomplete: ${PENDING_STAGES[*]}. No release-grade s14-full-contest.json was written."
