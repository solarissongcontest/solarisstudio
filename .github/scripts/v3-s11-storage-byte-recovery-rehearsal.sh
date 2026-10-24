#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-storage-restore] %s\n' "$*"; }
fail() { printf '\n[v3-s11-storage-restore] FAIL: %s\n' "$*" >&2; exit 1; }

for command in supabase curl psql python3 git; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

assert_loopback_url() {
  local label="$1" value="$2" schemes_csv="$3"
  python3 - "$label" "$value" "$schemes_csv" <<'PY' || exit 1
import ipaddress
import sys
from urllib.parse import urlparse

label, value, schemes_csv = sys.argv[1:]
parsed = urlparse(value)
allowed_schemes = set(schemes_csv.split(","))
if parsed.scheme not in allowed_schemes:
    raise SystemExit(f"{label} must use one of {sorted(allowed_schemes)}")
host = (parsed.hostname or "").lower()
if host == "localhost":
    raise SystemExit(0)
try:
    if ipaddress.ip_address(host).is_loopback:
        raise SystemExit(0)
except ValueError:
    pass
raise SystemExit(f"{label} is not loopback: {value}")
PY
}

assert_loopback_url "Supabase API_URL" "$API_URL" "http,https" \
  || fail "Refusing hosted Supabase Storage recovery rehearsal ($API_URL)"
assert_loopback_url "Supabase DB_URL" "$DB_URL" "postgres,postgresql" \
  || fail "Refusing non-local database during Storage recovery rehearsal"

EVIDENCE_OUTPUT="${V3_STORAGE_RECOVERY_EVIDENCE_OUTPUT:-}"
EVIDENCE_SHA="${V3_STORAGE_RECOVERY_EVIDENCE_SHA:-}"
EVIDENCE_OPERATOR="${V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR:-}"
EVIDENCE_ENVIRONMENT="${V3_STORAGE_RECOVERY_EVIDENCE_ENVIRONMENT:-isolated-local-supabase-storage}"

verify_evidence_checkout() {
  [[ -n "$EVIDENCE_OUTPUT" ]] || return 0
  [[ "$EVIDENCE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] \
    || fail "V3_STORAGE_RECOVERY_EVIDENCE_SHA must be an exact 40-character commit SHA"
  local head_sha
  head_sha="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
  [[ "$head_sha" == "$(printf '%s' "$EVIDENCE_SHA" | tr '[:upper:]' '[:lower:]')" ]] \
    || fail "Storage recovery evidence SHA does not match checked-out HEAD"
  [[ -z "$(git status --porcelain --untracked-files=all)" ]] \
    || fail "Storage recovery evidence requires a clean worktree"
  [[ -n "$EVIDENCE_OPERATOR" && ${#EVIDENCE_OPERATOR} -le 120 ]] \
    || fail "V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR must be 1..120 characters"
  [[ -n "$EVIDENCE_ENVIRONMENT" && ${#EVIDENCE_ENVIRONMENT} -le 120 ]] \
    || fail "V3_STORAGE_RECOVERY_EVIDENCE_ENVIRONMENT must be 1..120 characters"
}

verify_evidence_checkout

TMP_ROOT="$(mktemp -d)"
SEED_ROOT="$TMP_ROOT/seed"
BACKUP_ROOT="$TMP_ROOT/backup"
RESTORED_ROOT="$TMP_ROOT/restored"
mkdir -p "$SEED_ROOT/text" "$SEED_ROOT/json" "$SEED_ROOT/binary" \
  "$BACKUP_ROOT/text" "$BACKUP_ROOT/json" "$BACKUP_ROOT/binary" \
  "$RESTORED_ROOT/text" "$RESTORED_ROOT/json" "$RESTORED_ROOT/binary"

BUCKET="v3-s11-storage-recovery-${RANDOM}-$$"
REHEARSAL_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

cat >"$SEED_ROOT/text/notice.txt" <<'EOF'
Solaris V3 S11 storage recovery proof.
The recovered bytes must match this exact snapshot.
EOF
cat >"$SEED_ROOT/json/state.json" <<'EOF'
{"kind":"v3-s11-storage-recovery","version":1,"private":true}
EOF
python3 - "$SEED_ROOT/binary/payload.bin" <<'PY'
from pathlib import Path
import sys
Path(sys.argv[1]).write_bytes(bytes(range(256)) + b"\x00SOLARIS\xffRECOVERY\x00")
PY

OBJECT_KEYS=(
  "text/notice.txt"
  "json/state.json"
  "binary/payload.bin"
)
OBJECT_MIMES=(
  "text/plain"
  "application/json"
  "application/octet-stream"
)

HTTP_STATUS=''
HTTP_BODY=''

request_json() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(
    -sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key"
    -H "Authorization: Bearer $bearer"
    -H "Content-Type: application/json"
  )
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
  log "PASS: $label"
}

upload_file() {
  local key="$1" mime="$2" file="$3"
  local output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' \
    -X POST "$API_URL/storage/v1/object/$BUCKET/$key" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: $mime" \
    -H "cache-control: no-cache" \
    --data-binary "@$file")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
  expect_success "upload $key"
}

download_file() {
  local key="$1" token="$2" api_key="$3" output="$4"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' \
    -X GET "$API_URL/storage/v1/object/authenticated/$BUCKET/$key" \
    -H "apikey: $api_key" \
    -H "Authorization: Bearer $token")"
}

delete_objects() {
  local payload
  payload="$(python3 - "${OBJECT_KEYS[@]}" <<'PY'
import json
import sys
print(json.dumps({"prefixes": sys.argv[1:]}))
PY
)"
  request_json DELETE "$API_URL/storage/v1/object/$BUCKET" \
    "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$payload"
  expect_success "delete recovery objects through Storage batch API"
}

db_scalar() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

sha256_file() {
  python3 - "$1" <<'PY'
from pathlib import Path
import hashlib, sys
print(hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

file_size() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys
print(Path(sys.argv[1]).stat().st_size)
PY
}

cleanup() {
  set +e
  local payload
  payload="$(python3 - "${OBJECT_KEYS[@]}" <<'PY'
import json
import sys
print(json.dumps({"prefixes": sys.argv[1:]}))
PY
)"
  curl -sS -o /dev/null -X DELETE "$API_URL/storage/v1/object/$BUCKET" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$payload" >/dev/null 2>&1 || true
  curl -sS -o /dev/null -X DELETE "$API_URL/storage/v1/bucket/$BUCKET" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

log "Creating isolated private recovery bucket"
BUCKET_BODY="$(python3 - "$BUCKET" <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "name": sys.argv[1], "public": False}))
PY
)"
request_json POST "$API_URL/storage/v1/bucket" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$BUCKET_BODY"
expect_success "create private recovery bucket"
[[ "$(db_scalar "select public::text from storage.buckets where id='$BUCKET';")" == "false" ]] \
  || fail "recovery bucket is not private"

log "Seeding three deterministic private objects"
for index in "${!OBJECT_KEYS[@]}"; do
  upload_file "${OBJECT_KEYS[$index]}" "${OBJECT_MIMES[$index]}" \
    "$SEED_ROOT/${OBJECT_KEYS[$index]}"
done
[[ "$(db_scalar "select count(*) from storage.objects where bucket_id='$BUCKET';")" == "3" ]] \
  || fail "seed object count mismatch"

log "Proving private objects are not anonymously retrievable"
download_file "${OBJECT_KEYS[0]}" "$ANON_KEY" "$ANON_KEY" "$TMP_ROOT/anonymous-before"
if (( HTTP_STATUS < 400 )); then
  fail "anonymous caller unexpectedly read private source object"
fi
rm -f "$TMP_ROOT/anonymous-before"

log "Capturing byte-level recovery snapshot through the Storage API"
MANIFEST_LINES="$TMP_ROOT/source-manifest.tsv"
: >"$MANIFEST_LINES"
for index in "${!OBJECT_KEYS[@]}"; do
  key="${OBJECT_KEYS[$index]}"
  backup_file="$BACKUP_ROOT/$key"
  download_file "$key" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$backup_file"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    fail "backup download $key returned HTTP $HTTP_STATUS"
  fi
  sha="$(sha256_file "$backup_file")"
  bytes="$(file_size "$backup_file")"
  mime="$(db_scalar "select coalesce(metadata->>'mimetype','') from storage.objects where bucket_id='$BUCKET' and name='$key';")"
  [[ -n "$mime" ]] || fail "source MIME metadata missing for $key"
  printf '%s\t%s\t%s\t%s\n' "$key" "$sha" "$bytes" "$mime" >>"$MANIFEST_LINES"
done

SNAPSHOT_MANIFEST_SHA256="$(python3 - "$MANIFEST_LINES" <<'PY'
from pathlib import Path
import hashlib, sys
print(hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"

STARTED_AT="$(python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'))
PY
)"
START_NS="$(python3 - <<'PY'
import time
print(time.time_ns())
PY
)"

log "Injecting isolated byte loss through the Storage batch-delete API"
delete_objects
[[ "$(db_scalar "select count(*) from storage.objects where bucket_id='$BUCKET';")" == "0" ]] \
  || fail "object metadata remained after Storage API loss injection"
request_json DELETE "$API_URL/storage/v1/bucket/$BUCKET" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY"
expect_success "remove empty recovery bucket"
[[ "$(db_scalar "select count(*) from storage.buckets where id='$BUCKET';")" == "0" ]] \
  || fail "bucket metadata remained after loss injection"

log "Recreating the same private bucket and restoring the same object keys"
request_json POST "$API_URL/storage/v1/bucket" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$BUCKET_BODY"
expect_success "recreate private recovery bucket"
[[ "$(db_scalar "select public::text from storage.buckets where id='$BUCKET';")" == "false" ]] \
  || fail "restored recovery bucket is not private"

for index in "${!OBJECT_KEYS[@]}"; do
  upload_file "${OBJECT_KEYS[$index]}" "${OBJECT_MIMES[$index]}" \
    "$BACKUP_ROOT/${OBJECT_KEYS[$index]}"
done

log "Verifying restored bytes, keys, MIME metadata and privacy"
RESTORED_MANIFEST_LINES="$TMP_ROOT/restored-manifest.tsv"
: >"$RESTORED_MANIFEST_LINES"
for index in "${!OBJECT_KEYS[@]}"; do
  key="${OBJECT_KEYS[$index]}"
  restored_file="$RESTORED_ROOT/$key"
  download_file "$key" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$restored_file"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    fail "restored download $key returned HTTP $HTTP_STATUS"
  fi
  sha="$(sha256_file "$restored_file")"
  bytes="$(file_size "$restored_file")"
  mime="$(db_scalar "select coalesce(metadata->>'mimetype','') from storage.objects where bucket_id='$BUCKET' and name='$key';")"
  [[ -n "$mime" ]] || fail "restored MIME metadata missing for $key"
  printf '%s\t%s\t%s\t%s\n' "$key" "$sha" "$bytes" "$mime" >>"$RESTORED_MANIFEST_LINES"
done
cmp -s "$MANIFEST_LINES" "$RESTORED_MANIFEST_LINES" \
  || fail "restored object manifest differs from the recovery snapshot"
[[ "$(db_scalar "select count(*) from storage.objects where bucket_id='$BUCKET';")" == "3" ]] \
  || fail "restored object count mismatch"

download_file "${OBJECT_KEYS[0]}" "$ANON_KEY" "$ANON_KEY" "$TMP_ROOT/anonymous-after"
if (( HTTP_STATUS < 400 )); then
  fail "anonymous caller unexpectedly read restored private object"
fi
rm -f "$TMP_ROOT/anonymous-after"

COMPLETED_AT="$(python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'))
PY
)"
END_NS="$(python3 - <<'PY'
import time
print(time.time_ns())
PY
)"
REHEARSAL_RTO_MS="$(((END_NS - START_NS) / 1000000))"

if [[ -n "$EVIDENCE_OUTPUT" ]]; then
  verify_evidence_checkout
  mkdir -p "$(dirname "$EVIDENCE_OUTPUT")"
  python3 - \
    "$EVIDENCE_OUTPUT" \
    "$(printf '%s' "$EVIDENCE_SHA" | tr '[:upper:]' '[:lower:]')" \
    "$EVIDENCE_ENVIRONMENT" \
    "$EVIDENCE_OPERATOR" \
    "$REHEARSAL_ID" \
    "$STARTED_AT" \
    "$COMPLETED_AT" \
    "$SNAPSHOT_MANIFEST_SHA256" \
    "$REHEARSAL_RTO_MS" \
    "$MANIFEST_LINES" <<'PY'
import json
from pathlib import Path
import sys

(
    output_path,
    commit_sha,
    environment,
    operator_identity,
    rehearsal_id,
    started_at,
    completed_at,
    manifest_sha256,
    rehearsal_rto_ms,
    manifest_path,
) = sys.argv[1:]

objects = []
for line in Path(manifest_path).read_text(encoding="utf-8").splitlines():
    key, sha256, byte_size, mime = line.split("\t", 3)
    objects.append({
        "key": key,
        "sha256": sha256,
        "bytes": int(byte_size),
        "mimeType": mime,
    })

evidence = {
    "schemaVersion": 1,
    "kind": "storage_byte_recovery_rehearsal",
    "scope": "isolated_local_supabase_storage",
    "status": "passed",
    "commitSha": commit_sha,
    "environment": environment,
    "operatorIdentity": operator_identity,
    "rehearsalId": rehearsal_id,
    "startedAt": started_at,
    "completedAt": completed_at,
    "snapshot": {
        "manifestSha256": manifest_sha256,
        "objectCount": len(objects),
        "objects": objects,
        "bucketPublic": False,
    },
    "achieved": {
        "exerciseRpoSeconds": 0,
        "exerciseRtoMs": int(rehearsal_rto_ms),
        "providerRpoClaim": False,
        "providerRtoClaim": False,
    },
    "validation": {
        "sameBucketIdRestored": True,
        "sameObjectKeysRestored": True,
        "byteHashesVerified": True,
        "byteSizesVerified": True,
        "mimeTypesVerified": True,
        "privatePolicyVerified": True,
        "storageApiDeleteVerified": True,
        "restoredCount": len(objects),
        "missingCount": 0,
        "extraCount": 0,
    },
    "issuesFound": [],
    "followUpActions": [
        "Validate hosted Supabase Storage backup/export source availability and provider restore behavior before final S11 certification."
    ],
    "certificationClaim": False,
    "qaReviewRequired": True,
}
Path(output_path).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
PY
  log "Wrote exact-SHA Storage recovery evidence to $EVIDENCE_OUTPUT"
fi

log "Storage byte recovery rehearsal passed against isolated local Supabase"
