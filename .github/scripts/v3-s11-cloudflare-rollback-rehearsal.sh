#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-cloudflare-rollback] %s\n' "$*"; }
fail() { printf '\n[v3-s11-cloudflare-rollback] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*" >&2; exit 1; }

readonly WRANGLER_VERSION='4.141.0'
readonly PRODUCTION_WORKER_NAME='studio'
readonly COMPATIBILITY_DATE='2026-08-15'

: "${SOLARIS_S11_ROLLBACK_WORKER:?Set SOLARIS_S11_ROLLBACK_WORKER to a dedicated non-production Worker named solaris-s11-rollback-*}"
: "${SOLARIS_S11_ROLLBACK_OPERATOR:?Set SOLARIS_S11_ROLLBACK_OPERATOR to a bounded operator/evidence label}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID for the isolated Worker account}"
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN with permission to deploy the isolated Worker}"

WORKER_NAME="$(printf '%s' "$SOLARIS_S11_ROLLBACK_WORKER" | tr '[:upper:]' '[:lower:]')"
OPERATOR_IDENTITY="$SOLARIS_S11_ROLLBACK_OPERATOR"
EVIDENCE_PATH="${SOLARIS_S11_ROLLBACK_EVIDENCE_PATH:-}"

[[ "$WORKER_NAME" != "$PRODUCTION_WORKER_NAME" ]] || fail "Refusing production Cloudflare Worker '$PRODUCTION_WORKER_NAME'"
[[ "$WORKER_NAME" =~ ^solaris-s11-rollback-[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] \
  || fail "Worker must use the dedicated solaris-s11-rollback-* namespace"
(( ${#WORKER_NAME} <= 63 )) || fail "Worker name exceeds the 63-character safety bound"
[[ -n "$OPERATOR_IDENTITY" && ${#OPERATOR_IDENTITY} -le 120 ]] \
  || fail "SOLARIS_S11_ROLLBACK_OPERATOR must be 1..120 characters"

for command in bun curl git python3 sha256sum; do
  command -v "$command" >/dev/null 2>&1 || fail "Missing required command: $command"
done

COMMIT_SHA="$(git rev-parse HEAD)"
[[ "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Could not resolve an exact repository commit SHA"
if [[ -n "$EVIDENCE_PATH" ]]; then
  git diff --quiet && git diff --cached --quiet \
    || fail "Refusing retained exact-SHA evidence from a dirty working tree"
fi

REHEARSAL_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
RUN_SUFFIX="${REHEARSAL_ID%%-*}"
SHORT_SHA="${COMMIT_SHA:0:12}"
BASELINE_TAG="s11-${SHORT_SHA}-${RUN_SUFFIX}-baseline"
DEFECTIVE_TAG="s11-${SHORT_SHA}-${RUN_SUFFIX}-defective"
STARTED_AT="$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

CONFIG="$TMP_DIR/wrangler.jsonc"
WORKER_SOURCE="$TMP_DIR/worker.mjs"
BASELINE_DEPLOY_OUTPUT="$TMP_DIR/baseline-deploy.ndjson"
DEFECTIVE_UPLOAD_OUTPUT="$TMP_DIR/defective-upload.ndjson"
DEFECTIVE_DEPLOY_OUTPUT="$TMP_DIR/defective-deploy.ndjson"
PRE_ROLLBACK_DEPLOYMENTS="$TMP_DIR/pre-rollback-deployments.json"
ROLLBACK_COMMAND_OUTPUT="$TMP_DIR/rollback-command.log"
POST_ROLLBACK_DEPLOYMENTS="$TMP_DIR/post-rollback-deployments.json"
BASELINE_RUNTIME="$TMP_DIR/baseline-runtime.json"
DEFECTIVE_RUNTIME="$TMP_DIR/defective-runtime.json"
ROLLBACK_RUNTIME="$TMP_DIR/rollback-runtime.json"

cat >"$CONFIG" <<EOF
{
  "name": "$WORKER_NAME",
  "main": "worker.mjs",
  "compatibility_date": "$COMPATIBILITY_DATE",
  "workers_dev": true,
  "preview_urls": true,
  "version_metadata": {
    "binding": "CF_VERSION_METADATA"
  }
}
EOF

if grep -Eqi 'supabase|service_role|publishable|database|r2|kv_|d1|queue|durable|hyperdrive' "$CONFIG"; then
  fail "Isolated rollback fixture config unexpectedly contains a Solaris/data resource binding"
fi

write_fixture() {
  local marker="$1" status="$2"
  cat >"$WORKER_SOURCE" <<EOF
export default {
  async fetch(_request, env) {
    const metadata = env.CF_VERSION_METADATA ?? {};
    return new Response(JSON.stringify({
      rehearsal: "solaris-s11-cloudflare-rollback",
      rehearsalId: "$REHEARSAL_ID",
      marker: "$marker",
      versionId: metadata.id ?? null,
      versionTag: metadata.tag ?? null,
      versionTimestamp: metadata.timestamp ?? null
    }), {
      status: $status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
};
EOF
}

wrangler_env() {
  env \
    -u SUPABASE_URL \
    -u VITE_SUPABASE_URL \
    -u E2E_SUPABASE_URL \
    -u CONFIRMATIONS_SUPABASE_URL \
    -u VITE_CONFIRMATIONS_SUPABASE_URL \
    -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_DB_URL \
    -u SUPABASE_DATABASE_URL \
    FORCE_COLOR=0 \
    WRANGLER_SEND_METRICS=false \
    "$@"
}

run_wrangler_with_output() {
  local output_path="$1"
  shift
  rm -f "$output_path"
  (
    cd "$TMP_DIR"
    WRANGLER_OUTPUT_FILE_PATH="$output_path" \
      wrangler_env bunx "wrangler@$WRANGLER_VERSION" "$@"
  )
  [[ -s "$output_path" ]] || fail "Wrangler did not produce retained structured output: $output_path"
}

run_wrangler_json() {
  local output_path="$1"
  shift
  (
    cd "$TMP_DIR"
    wrangler_env bunx "wrangler@$WRANGLER_VERSION" "$@"
  ) >"$output_path"
  [[ -s "$output_path" ]] || fail "Wrangler did not produce JSON output: $output_path"
}

ndjson_field() {
  local path="$1" event_type="$2" field_path="$3"
  python3 - "$path" "$event_type" "$field_path" <<'PY'
import json, sys
path, wanted_type, field_path = sys.argv[1:4]
found = None
with open(path, encoding="utf-8") as handle:
    for raw in handle:
        raw = raw.strip()
        if not raw:
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if value.get("type") == wanted_type:
            found = value
if found is None:
    raise SystemExit(2)
value = found
for part in field_path.split("."):
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value[part]
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("")
else:
    print(value)
PY
}

verify_wrangler_version() {
  local path="$1" actual
  actual="$(ndjson_field "$path" wrangler-session wrangler_version)" \
    || fail "Wrangler structured output has no session version"
  [[ "$actual" == "$WRANGLER_VERSION" ]] \
    || fail "Expected Wrangler $WRANGLER_VERSION, got $actual"
}

wait_for_runtime() {
  local expected_marker="$1" expected_version="$2" expected_status="$3" output_path="$4"
  local attempt status body_tmp
  body_tmp="$TMP_DIR/runtime-body.json"
  for attempt in $(seq 1 45); do
    status="$(curl -sS --connect-timeout 3 --max-time 8 \
      -o "$body_tmp" -w '%{http_code}' \
      "${TARGET_URL}?rehearsal=${REHEARSAL_ID}&attempt=${attempt}" || true)"
    if [[ "$status" == "$expected_status" ]] && python3 - "$body_tmp" "$REHEARSAL_ID" "$expected_marker" "$expected_version" <<'PY'
import json, sys
path, rehearsal_id, marker, version_id = sys.argv[1:5]
try:
    with open(path, encoding="utf-8") as handle:
        value = json.load(handle)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if (
    value.get("rehearsal") == "solaris-s11-cloudflare-rollback"
    and value.get("rehearsalId") == rehearsal_id
    and value.get("marker") == marker
    and value.get("versionId") == version_id
) else 1)
PY
    then
      cp "$body_tmp" "$output_path"
      return 0
    fi
    sleep 1
  done
  fail "Runtime did not converge to marker=$expected_marker version=$expected_version status=$expected_status"
}

verify_single_version_deployment() {
  local path="$1" expected_version="$2"
  python3 - "$path" "$expected_version" <<'PY'
import json, sys
from datetime import datetime
path, expected = sys.argv[1:3]
with open(path, encoding="utf-8") as handle:
    value = json.load(handle)
if isinstance(value, list):
    deployments = value
elif isinstance(value, dict):
    deployments = value.get("deployments") or value.get("result") or []
else:
    deployments = []
if not deployments:
    raise SystemExit("no deployments returned")
def key(item):
    stamp = item.get("created_on") or item.get("createdOn") or ""
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0
latest = max(deployments, key=key)
versions = latest.get("versions") or []
if len(versions) != 1:
    raise SystemExit("latest deployment is not single-version")
version = versions[0]
version_id = version.get("version_id") or version.get("versionId")
percentage = version.get("percentage")
if version_id != expected or float(percentage) != 100.0:
    raise SystemExit(f"latest deployment mismatch: {version_id}@{percentage}")
print(latest.get("id") or latest.get("deployment_id") or "")
PY
}

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

log "Deploy an immutable known-good fixture version to the isolated Worker"
write_fixture 'known-good' 200
run_wrangler_with_output "$BASELINE_DEPLOY_OUTPUT" \
  deploy --config wrangler.jsonc --tag "$BASELINE_TAG" \
  --message "Solaris S11 rollback baseline $COMMIT_SHA $REHEARSAL_ID"
verify_wrangler_version "$BASELINE_DEPLOY_OUTPUT"
BASELINE_VERSION_ID="$(ndjson_field "$BASELINE_DEPLOY_OUTPUT" deploy version_id)" \
  || fail "Baseline deploy output has no version id"
TARGET_URL="$(ndjson_field "$BASELINE_DEPLOY_OUTPUT" deploy targets.0)" \
  || fail "Baseline deploy output has no Worker target URL"
[[ "$BASELINE_VERSION_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "Baseline Worker version id is not a UUID"
[[ "$TARGET_URL" == https://*.workers.dev* ]] || fail "Refusing non-workers.dev rollback target: $TARGET_URL"
[[ "$TARGET_URL" == *"$WORKER_NAME"* ]] || fail "Rollback target URL does not belong to the isolated Worker"
wait_for_runtime 'known-good' "$BASELINE_VERSION_ID" 200 "$BASELINE_RUNTIME"
log "PASS: known-good baseline is serving exact Cloudflare version $BASELINE_VERSION_ID"

log "Upload and promote a deliberately defective fixture version"
write_fixture 'defective' 503
run_wrangler_with_output "$DEFECTIVE_UPLOAD_OUTPUT" \
  versions upload --config wrangler.jsonc --tag "$DEFECTIVE_TAG" \
  --message "Solaris S11 defective version $COMMIT_SHA $REHEARSAL_ID"
verify_wrangler_version "$DEFECTIVE_UPLOAD_OUTPUT"
DEFECTIVE_VERSION_ID="$(ndjson_field "$DEFECTIVE_UPLOAD_OUTPUT" version-upload version_id)" \
  || fail "Defective upload output has no version id"
[[ "$DEFECTIVE_VERSION_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "Defective Worker version id is not a UUID"
[[ "$DEFECTIVE_VERSION_ID" != "$BASELINE_VERSION_ID" ]] || fail "Defective upload reused the baseline version id"

run_wrangler_with_output "$DEFECTIVE_DEPLOY_OUTPUT" \
  versions deploy "${DEFECTIVE_VERSION_ID}@100%" --config wrangler.jsonc --yes \
  --message "Solaris S11 promote defective version $COMMIT_SHA $REHEARSAL_ID"
verify_wrangler_version "$DEFECTIVE_DEPLOY_OUTPUT"
wait_for_runtime 'defective' "$DEFECTIVE_VERSION_ID" 503 "$DEFECTIVE_RUNTIME"
run_wrangler_json "$PRE_ROLLBACK_DEPLOYMENTS" \
  deployments list --config wrangler.jsonc --name "$WORKER_NAME" --json
verify_single_version_deployment "$PRE_ROLLBACK_DEPLOYMENTS" "$DEFECTIVE_VERSION_ID" >/dev/null \
  || fail "Defective version is not the exact 100% active deployment before rollback"
log "PASS: defective version is observably active before rollback"

log "Execute the real Cloudflare rollback to the immutable known-good version"
ROLLBACK_START_MS="$(python3 -c 'import time; print(int(time.time() * 1000))')"
(
  cd "$TMP_DIR"
  wrangler_env bunx "wrangler@$WRANGLER_VERSION" \
    rollback "$BASELINE_VERSION_ID" --config wrangler.jsonc --name "$WORKER_NAME" \
    --message "Solaris S11 rollback to known-good $COMMIT_SHA $REHEARSAL_ID"
) >"$ROLLBACK_COMMAND_OUTPUT" 2>&1 
[[ -s "$ROLLBACK_COMMAND_OUTPUT" ]] || fail "Rollback command produced no retained output"

run_wrangler_json "$POST_ROLLBACK_DEPLOYMENTS" \
  deployments list --config wrangler.jsonc --name "$WORKER_NAME" --json
ROLLBACK_DEPLOYMENT_ID="$(verify_single_version_deployment "$POST_ROLLBACK_DEPLOYMENTS" "$BASELINE_VERSION_ID")" \
  || fail "Cloudflare did not create a 100% single-version rollback deployment"
wait_for_runtime 'known-good' "$BASELINE_VERSION_ID" 200 "$ROLLBACK_RUNTIME"
ROLLBACK_END_MS="$(python3 -c 'import time; print(int(time.time() * 1000))')"
ROLLBACK_DURATION_MS=$((ROLLBACK_END_MS - ROLLBACK_START_MS))
log "PASS: Cloudflare rollback converged to exact known-good version $BASELINE_VERSION_ID in ${ROLLBACK_DURATION_MS}ms"

COMPLETED_AT="$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"

if [[ -n "$EVIDENCE_PATH" ]]; then
  mkdir -p "$(dirname "$EVIDENCE_PATH")"
  python3 - \
    "$EVIDENCE_PATH" "$COMMIT_SHA" "$OPERATOR_IDENTITY" "$REHEARSAL_ID" \
    "$STARTED_AT" "$COMPLETED_AT" "$WORKER_NAME" "$TARGET_URL" \
    "$BASELINE_VERSION_ID" "$DEFECTIVE_VERSION_ID" "$ROLLBACK_DEPLOYMENT_ID" \
    "$ROLLBACK_DURATION_MS" "$WRANGLER_VERSION" \
    "$(sha256_file "$BASELINE_DEPLOY_OUTPUT")" \
    "$(sha256_file "$DEFECTIVE_UPLOAD_OUTPUT")" \
    "$(sha256_file "$DEFECTIVE_DEPLOY_OUTPUT")" \
    "$(sha256_file "$PRE_ROLLBACK_DEPLOYMENTS")" \
    "$(sha256_file "$ROLLBACK_COMMAND_OUTPUT")" \
    "$(sha256_file "$POST_ROLLBACK_DEPLOYMENTS")" <<'PY'
import json, sys
(
    path, commit_sha, operator, rehearsal_id, started_at, completed_at,
    worker_name, target_url, baseline_id, defective_id, rollback_deployment_id,
    rollback_ms, wrangler_version, baseline_deploy_digest, defective_upload_digest,
    defective_deploy_digest, pre_rollback_digest, rollback_output_digest,
    post_rollback_digest,
) = sys.argv[1:20]
value = {
    "schemaVersion": 1,
    "kind": "cloudflare_deployment_rollback_rehearsal",
    "scope": "isolated_cloudflare_worker",
    "status": "passed",
    "commitSha": commit_sha,
    "environment": "isolated-cloudflare-worker",
    "operatorIdentity": operator,
    "rehearsalId": rehearsal_id,
    "startedAt": started_at,
    "completedAt": completed_at,
    "wranglerVersion": wrangler_version,
    "worker": {
        "name": worker_name,
        "productionWorkerName": "studio",
        "targetUrl": target_url,
        "fixtureBindings": "CF_VERSION_METADATA only",
    },
    "versions": {
        "baseline": {"id": baseline_id, "marker": "known-good"},
        "defective": {"id": defective_id, "marker": "defective"},
        "rolledBackToVersionId": baseline_id,
        "rollbackDeploymentId": rollback_deployment_id or None,
    },
    "achieved": {
        "isolatedProviderRollbackMs": int(rollback_ms),
        "productionRpoClaim": False,
        "productionRtoClaim": False,
        "dataRollbackClaim": False,
    },
    "validation": {
        "baselineServedBeforeDefect": True,
        "defectiveServedBeforeRollback": True,
        "rollbackDeploymentSingleVersion": True,
        "rollbackTrafficPercent": 100,
        "runtimeVersionMatchesBaseline": True,
        "runtimeMarkerMatchesBaseline": True,
        "fixtureContainsNoSolarisBindings": True,
        "databaseRollbackAttempted": False,
        "storageRollbackAttempted": False,
    },
    "artifactDigests": {
        "baselineDeploy": baseline_deploy_digest,
        "defectiveUpload": defective_upload_digest,
        "defectiveDeploy": defective_deploy_digest,
        "preRollbackDeployments": pre_rollback_digest,
        "rollbackCommandOutput": rollback_output_digest,
        "postRollbackDeployments": post_rollback_digest,
    },
    "issuesFound": [],
    "followUpActions": [
        "Compose database + Storage + deployment evidence in the separate full-service recovery drill.",
        "Retain production-specific schema-compatibility review and provider RTO/RPO evidence before final S11 certification.",
    ],
    "certificationClaim": False,
    "fullServiceRecoveryClaim": False,
    "qaReviewRequired": True,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(value, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
  log "Retained component evidence at $EVIDENCE_PATH"
fi

log "System V3 S11 isolated Cloudflare deployment rollback rehearsal passed"
log "This is component evidence only: production RPO/RTO, data recovery, full-service recovery and release certification remain unclaimed."
