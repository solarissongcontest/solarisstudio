#!/usr/bin/env bash
set -euo pipefail

evidence_dir="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
capture_file="$(mktemp)"
mkdir -p "$evidence_dir"

cleanup() {
  rm -f "$capture_file"
}
trap cleanup EXIT

set +e
bash .github/scripts/v3-full-contest-rehearsal.sh 2>&1 | tee "$capture_file"
pipeline_status=("${PIPESTATUS[@]}")
set -e

rehearsal_status="${pipeline_status[0]:-1}"
tee_status="${pipeline_status[1]:-1}"

if [[ "$tee_status" != "0" ]]; then
  echo "::error::S14 diagnostic capture tee failed with exit $tee_status" >&2
  if [[ "$rehearsal_status" == "0" ]]; then
    exit "$tee_status"
  fi
fi

partial="$evidence_dir/s14-full-contest.partial.json"
diagnostic="$evidence_dir/s14-stage8-diagnostic.json"

if [[ "$rehearsal_status" != "0" && -s "$partial" ]]; then
  set +e
  python3 - "$capture_file" "$partial" "$diagnostic" "$rehearsal_status" "${V3_CANDIDATE_SHA:-}" <<'PY'
import json
import pathlib
import re
import sys

capture_path = pathlib.Path(sys.argv[1])
partial_path = pathlib.Path(sys.argv[2])
diagnostic_path = pathlib.Path(sys.argv[3])
exit_code = int(sys.argv[4])
candidate_sha = sys.argv[5].strip().lower()

partial = json.loads(partial_path.read_text(encoding="utf-8"))
failure_stage = partial.get("failureStage") or partial.get("failurePhase")
if failure_stage != "stage-8-results":
    raise SystemExit(0)

lines = capture_path.read_text(encoding="utf-8", errors="replace").splitlines()

def sanitize(value):
    text = "" if value is None else str(value)
    text = re.sub(r"(?i)(authorization:\s*bearer\s+)[^\s\"']+", r"\1[REDACTED]", text)
    text = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1[REDACTED]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b", "[REDACTED_JWT]", text)
    text = re.sub(
        r"(?i)\b(service_role_key|service_role|anon_key|apikey|api_key|password|access_token|refresh_token|token)=([^\s]+)",
        r"\1=[REDACTED]",
        text,
    )
    return text[:2000]

def fields_from_marker(line):
    marker = line.split("RESULTS_STAGE8 ", 1)[1] if "RESULTS_STAGE8 " in line else line
    fields = {}
    for match in re.finditer(r"([A-Za-z][A-Za-z0-9_]*)=([^\s]+)", marker):
        fields[match.group(1)] = sanitize(match.group(2))
    return fields

def nullable(value):
    if value in (None, "", "na", "null", "missing", "<none>"):
        return None
    return value

def maybe_int(value):
    value = nullable(value)
    if value is None:
        return None
    return int(value) if re.fullmatch(r"-?[0-9]+", str(value)) else value

stage8_markers = [
    (index, line, fields_from_marker(line))
    for index, line in enumerate(lines)
    if "RESULTS_STAGE8 " in line
]

failure_marker = None
for item in stage8_markers:
    fields = item[2]
    if fields.get("error_category") is not None and fields.get("operation") is not None:
        failure_marker = item
        break

last_completed_phase = None
limit = failure_marker[0] if failure_marker else len(lines)
for index, _line, fields in stage8_markers:
    if index >= limit:
        break
    phase = fields.get("phase")
    if phase and phase.endswith("_complete"):
        last_completed_phase = phase

if failure_marker:
    failure_index, _failure_line, failure_fields = failure_marker
    failed_phase = failure_fields.get("phase")
else:
    failure_index = stage8_markers[-1][0] if stage8_markers else max(len(lines) - 1, 0)
    failure_fields = stage8_markers[-1][2] if stage8_markers else {}
    failed_phase = failure_fields.get("phase") or "unmarked-stage8-failure"

snapshot_fields = {}
for index, _line, fields in reversed(stage8_markers):
    if index > failure_index:
        continue
    if failed_phase and fields.get("phase") == failed_phase and "edition_id" in fields:
        snapshot_fields = fields
        break
if not snapshot_fields:
    for index, _line, fields in reversed(stage8_markers):
        if index <= failure_index and "edition_id" in fields:
            snapshot_fields = fields
            break

fail_message = None
for line in lines[failure_index : min(len(lines), failure_index + 80)]:
    if "FAIL:" in line:
        fail_message = sanitize(line.split("FAIL:", 1)[1].strip())
        break

adapter_error = None
adapter_error_line = None
for line in reversed(lines[max(0, failure_index - 120) : failure_index + 1]):
    if "[v3-s14-results-adapter]" not in line:
        continue
    adapter_error_line = sanitize(line.strip())
    adapter_error = sanitize(line.split("[v3-s14-results-adapter]", 1)[1].strip())
    if adapter_error:
        break

context = []
for line in lines[max(0, failure_index - 120) : min(len(lines), failure_index + 16)]:
    clean = sanitize(line.strip())
    if not clean:
        continue
    if (
        "RESULTS_STAGE8 " in clean
        or "[v3-s14-results-adapter]" in clean
        or "FAIL:" in clean
        or re.search(r"(?i)\b(error|exception|fatal|returned HTTP|psql:)\b", clean)
    ):
        context.append(clean[:800])
context = context[-10:]

error_body = None
if fail_message:
    match = re.search(r"returned HTTP\s+([0-9]{3}):\s*(\{.*\}|\[.*\])$", fail_message)
    if match:
        try:
            parsed = json.loads(match.group(2))
            if isinstance(parsed, dict):
                error_body = {
                    "code": nullable(parsed.get("code")),
                    "message": nullable(parsed.get("message")),
                    "details": nullable(parsed.get("details")),
                    "hint": nullable(parsed.get("hint")),
                }
        except json.JSONDecodeError:
            pass

operation = nullable(failure_fields.get("operation"))
rpc = None
if operation:
    candidate = operation.split(":", 1)[0]
    if candidate.startswith("studio2_"):
        rpc = candidate

rpc_code = nullable(failure_fields.get("rpc_code"))
if error_body and error_body.get("code"):
    rpc_code = error_body["code"]

http_status = maybe_int(failure_fields.get("http_status"))
if error_body and fail_message:
    http_match = re.search(r"returned HTTP\s+([0-9]{3})", fail_message)
    if http_match:
        http_status = int(http_match.group(1))

canonical_state = {
    "showStatus": nullable(snapshot_fields.get("show_status")),
    "publicationState": nullable(snapshot_fields.get("publication_state")),
    "resultState": nullable(snapshot_fields.get("result_state")),
    "calculationVersion": maybe_int(snapshot_fields.get("calculation_version")),
    "reviewedVersion": maybe_int(snapshot_fields.get("reviewed_version")),
    "lockedVersion": maybe_int(snapshot_fields.get("locked_version")),
    "revealReadyVersion": maybe_int(snapshot_fields.get("reveal_ready_version")),
    "calculationReady": nullable(snapshot_fields.get("calculation_ready")),
    "participantCount": maybe_int(snapshot_fields.get("participant_count")),
    "juryBallots": maybe_int(snapshot_fields.get("jury_ballots")),
    "juryDnv": maybe_int(snapshot_fields.get("jury_dnv")),
    "televoteRows": maybe_int(snapshot_fields.get("televote_rows")),
    "resultRows": maybe_int(snapshot_fields.get("result_rows")),
    "rankedRows": maybe_int(snapshot_fields.get("ranked_rows")),
    "pointsSum": maybe_int(snapshot_fields.get("points_sum")),
}

diagnostic = {
    "schemaVersion": 1,
    "candidateSha": candidate_sha or partial.get("candidateSha"),
    "stage": "stage-8-results",
    "rehearsalExitCode": exit_code,
    "lastCompletedPhase": last_completed_phase,
    "failedPhase": failed_phase,
    "operation": operation,
    "rpc": rpc,
    "editionId": nullable(snapshot_fields.get("edition_id")),
    "showId": nullable(snapshot_fields.get("show_id")),
    "expectedVersion": maybe_int(
        failure_fields.get("expectedVersion") or snapshot_fields.get("expectedVersion")
    ),
    "actualVersion": maybe_int(snapshot_fields.get("calculation_version")),
    "actor": nullable(snapshot_fields.get("actor")),
    "capability": nullable(snapshot_fields.get("capability")),
    "operationId": nullable(
        failure_fields.get("operation_id") or snapshot_fields.get("operation_id")
    ),
    "canonicalState": canonical_state,
    "receipts": {
        "count": maybe_int(snapshot_fields.get("receipt_count")),
    },
    "events": {
        "count": maybe_int(snapshot_fields.get("event_count")),
    },
    "outbox": {
        "state": nullable(snapshot_fields.get("outbox")),
    },
    "error": {
        "category": nullable(failure_fields.get("error_category"))
        or ("unmarked_stage8_failure" if not failure_marker else None),
        "code": rpc_code,
        "httpStatus": http_status,
        "message": adapter_error or ((error_body or {}).get("message") if error_body else fail_message),
        "details": (error_body or {}).get("details") if error_body else None,
        "hint": (error_body or {}).get("hint") if error_body else None,
        "adapterLine": adapter_error_line,
        "failureLine": fail_message,
    },
    "context": context,
}

diagnostic_path.write_text(
    json.dumps(diagnostic, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY
  diagnostic_status=$?
  set -e

  if [[ "$diagnostic_status" != "0" ]]; then
    echo "::error::Failed to build compact Stage 8 diagnostic artifact (exit $diagnostic_status)" >&2
  elif [[ -s "$diagnostic" ]]; then
    if ! python3 -m json.tool "$diagnostic" >/dev/null; then
      echo "::error::Stage 8 diagnostic artifact is not valid JSON" >&2
      rm -f "$diagnostic"
    fi
  fi
fi

exit "$rehearsal_status"
