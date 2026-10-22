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

s14_stage7_persist_deadline_retry_diagnostic() {
  local round_snapshot="$1" preflight_snapshot="$2" submission_count="$3"
  local evidence_dir="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
  local evidence_path="$evidence_dir/stage7-deadline-retry-diagnostics.json"

  mkdir -p "$evidence_dir"

  STAGE7_HTTP_STATUS="$HTTP_STATUS" \
  STAGE7_HTTP_BODY="$HTTP_BODY" \
  STAGE7_ROUND_SNAPSHOT="$round_snapshot" \
  STAGE7_PREFLIGHT_SNAPSHOT="$preflight_snapshot" \
  STAGE7_SUBMISSION_COUNT="$submission_count" \
  STAGE7_EVIDENCE_PATH="$evidence_path" \
  python3 <<'PY'
import json
import os
import re
from pathlib import Path


def load_json(name, fallback):
    raw = os.environ.get(name, "")
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def safe_response(raw):
    # Never persist arbitrary response objects from an authenticated RPC. The
    # failing public vote currently returns a small error object, but keeping a
    # strict allow-list prevents a future server response from turning QA
    # evidence into an accidental credential/token dump.
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = None

    allowed = ("code", "message", "details", "hint", "error")
    if isinstance(parsed, dict):
        result = {}
        for key in allowed:
            value = parsed.get(key)
            if isinstance(value, (str, int, float, bool)) or value is None:
                result[key] = value
        if result:
            return result

    # Non-JSON failures are reduced to a short printable message and obvious
    # bearer/JWT-like material is redacted. This is diagnostic evidence, not a
    # raw HTTP transcript.
    text = raw[:1000]
    text = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]+=*", r"\1[REDACTED]", text)
    text = re.sub(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}", "[REDACTED_JWT]", text)
    return {"message": text}


round_state = load_json("STAGE7_ROUND_SNAPSHOT", None)
preflight_state = load_json("STAGE7_PREFLIGHT_SNAPSHOT", None)
try:
    submission_count = int(os.environ.get("STAGE7_SUBMISSION_COUNT", "0"))
except ValueError:
    submission_count = None
try:
    http_status = int(os.environ.get("STAGE7_HTTP_STATUS", "0"))
except ValueError:
    http_status = None

payload = {
    "boundary": "public Televote after governed deadline extension",
    "httpStatus": http_status,
    "response": safe_response(os.environ.get("STAGE7_HTTP_BODY", "")),
    "round": round_state,
    "preflight": preflight_state,
    "submissionCount": submission_count,
}

path = Path(os.environ["STAGE7_EVIDENCE_PATH"])
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

  log "S14_STAGE7_DEADLINE_RETRY_EVIDENCE path=$evidence_path"
}

# The post-extension ballot has previously failed without enough state to tell
# whether the QA fixture, the governed round mutation, or the final DB trigger
# rejected it. Capture only non-secret local state when that exact acceptance
# assertion is about to fail, then delegate to the canonical assertion so test
# semantics remain unchanged.
eval "$(declare -f expect_success | sed '1s/expect_success/expect_success_without_stage7_diagnostics/')"
expect_success() {
  local label="$1"
  if [[ "$label" == "public Televote after governed deadline extension" ]] \
     && ! (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
    local round_snapshot preflight_snapshot submission_count
    round_snapshot="$(db_scalar "
select jsonb_build_object(
  'roundId', r.id,
  'dbNow', clock_timestamp(),
  'status', r.status,
  'opensAt', r.opens_at,
  'closesAt', r.closes_at,
  'secondsRemaining', extract(epoch from (r.closes_at - clock_timestamp())),
  'roundVersion', coalesce(v.version,0)
)::text
from televoting.rounds r
left join public.studio2_televote_round_versions v on v.round_id=r.id
where r.id='$TV_ROUND_ID'::uuid;
")"
    preflight_snapshot="$(db_scalar "
select coalesce((
  select jsonb_build_object(
    'roundId', p.round_id,
    'username', p.username_normalized,
    'countryCode', p.country_code,
    'expiresAt', p.expires_at,
    'submittedAt', p.submitted_at,
    'expired', p.expires_at <= clock_timestamp(),
    'alreadyUsed', p.submitted_at is not null,
    'valid', p.expires_at > clock_timestamp() and p.submitted_at is null
  )::text
  from televoting.vote_preflight_checks p
  where p.round_id='$TV_ROUND_ID'::uuid
    and p.username_normalized='s14-public-52'
  order by p.created_at desc
  limit 1
), 'null');
")"
    submission_count="$(db_scalar "
select count(*)
from televoting.vote_submissions
where round_id='$TV_ROUND_ID'::uuid
  and username_normalized='s14-public-52'
  and status<>'deleted';
")"
    s14_stage7_persist_deadline_retry_diagnostic "$round_snapshot" "$preflight_snapshot" "$submission_count"
    log "S14_STAGE7_DEADLINE_RETRY_DIAGNOSTIC http_status=$HTTP_STATUS submissions=$submission_count; structured sanitized evidence persisted"
  fi
  expect_success_without_stage7_diagnostics "$@"
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
