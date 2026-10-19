#!/usr/bin/env bash
set -euo pipefail

# Diagnostic-only wrappers for the stateful S14 Stage 7 rehearsal.
# Every wrapped function delegates to the exact original implementation and
# changes only CURRENT_STAGE/log output so runtime failure evidence identifies
# the first failing Public Voting boundary without changing contest semantics.

s14_stage7_mark() {
  CURRENT_STAGE="stage-7-public-voting:$1"
  log "S14_STAGE7_DIAGNOSTIC $CURRENT_STAGE"
}

# Public-schema recovery/receipt RPCs are mixed into the Televote lifecycle.
eval "$(declare -f rpc_request | sed '1s/rpc_request/rpc_request_without_stage7_diagnostics/')"
rpc_request() {
  local function_name="$2"
  if [[ "${CURRENT_STAGE:-}" == stage-7-public-voting* ]]; then
    s14_stage7_mark "rpc:$function_name"
  fi
  rpc_request_without_stage7_diagnostics "$@"
}

# Televoting-schema RPCs carry the most useful boundary identity for failures.
eval "$(declare -f televote_rpc_request | sed '1s/televote_rpc_request/televote_rpc_request_without_stage7_diagnostics/')"
televote_rpc_request() {
  local function_name="$2"
  if [[ "${CURRENT_STAGE:-}" == stage-7-public-voting* ]]; then
    s14_stage7_mark "televote-rpc:$function_name"
  fi
  televote_rpc_request_without_stage7_diagnostics "$@"
}

# Preserve the governed status helper, including the genuine deadline adapter.
eval "$(declare -f apply_televote_round_status | sed '1s/apply_televote_round_status/apply_televote_round_status_without_stage7_diagnostics/')"
apply_televote_round_status() {
  local round_id="$1" status="$2"
  s14_stage7_mark "round-status:$status:$round_id"
  apply_televote_round_status_without_stage7_diagnostics "$@"
}

# Mark the initial deadline authority separately from ordinary round opening.
eval "$(declare -f s14_stage7_set_deadline_before_open | sed '1s/s14_stage7_set_deadline_before_open/s14_stage7_set_deadline_before_open_without_diagnostics/')"
s14_stage7_set_deadline_before_open() {
  local round_id="$1"
  s14_stage7_mark "deadline-set:$round_id"
  s14_stage7_set_deadline_before_open_without_diagnostics "$@"
}

# The special Semi 1 ballot deliberately crosses expiry and then exercises the
# +2 minute extension/replay/stale-version/consequence path.
eval "$(declare -f s14_stage7_extend_expired_semi_one | sed '1s/s14_stage7_extend_expired_semi_one/s14_stage7_extend_expired_semi_one_without_diagnostics/')"
s14_stage7_extend_expired_semi_one() {
  s14_stage7_mark "deadline-extension:$1:$2"
  s14_stage7_extend_expired_semi_one_without_diagnostics "$@"
}

# Give every supported ballot an identity before preflight/submission begins.
eval "$(declare -f submit_supported_vote | sed '1s/submit_supported_vote/submit_supported_vote_without_stage7_diagnostics/')"
submit_supported_vote() {
  s14_stage7_mark "ballot:$1:$2"
  submit_supported_vote_without_stage7_diagnostics "$@"
}

# Mark entry to the supported-case body. When it returns, the canonical Stage 7
# function immediately checks completion invariants, so leave that next label in
# CURRENT_STAGE for any final assertion failure.
eval "$(declare -f run_s14_stage_7_public_voting_supported_cases | sed '1s/run_s14_stage_7_public_voting_supported_cases/run_s14_stage_7_public_voting_supported_cases_without_diagnostics/')"
run_s14_stage_7_public_voting_supported_cases() {
  s14_stage7_mark "supported-cases"
  run_s14_stage_7_public_voting_supported_cases_without_diagnostics "$@"
  s14_stage7_mark "completion-invariants"
}
