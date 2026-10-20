#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-restore] %s\n' "$*"; }
fail() { printf '\n[v3-s11-restore] FAIL: %s\n' "$*" >&2; exit 1; }

: "${DB_URL:?DB_URL must point at an isolated local Supabase database}"

case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*)
    ;;
  *) fail "refusing non-local database restore rehearsal" ;;
esac

for command in psql pg_dump pg_restore python3; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

EVIDENCE_OUTPUT="${V3_RECOVERY_EVIDENCE_OUTPUT:-}"
EVIDENCE_SHA="${V3_RECOVERY_EVIDENCE_SHA:-}"
EVIDENCE_ENVIRONMENT="${V3_RECOVERY_EVIDENCE_ENVIRONMENT:-isolated-local-supabase}"

if [[ -n "$EVIDENCE_OUTPUT" ]]; then
  command -v git >/dev/null 2>&1 || fail "git is required when exact-SHA evidence output is requested"
  [[ "$EVIDENCE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] \
    || fail "V3_RECOVERY_EVIDENCE_SHA must be an exact 40-character commit SHA when evidence output is requested"
  HEAD_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
  [[ "$HEAD_SHA" == "$(printf '%s' "$EVIDENCE_SHA" | tr '[:upper:]' '[:lower:]')" ]] \
    || fail "recovery evidence SHA does not match checked-out HEAD"
  [[ -z "$(git status --porcelain --untracked-files=all)" ]] \
    || fail "recovery evidence requires a clean worktree"
  [[ -n "$EVIDENCE_ENVIRONMENT" && ${#EVIDENCE_ENVIRONMENT} -le 120 ]] \
    || fail "V3_RECOVERY_EVIDENCE_ENVIRONMENT must be 1..120 characters"
fi

RESTORE_DB="v3_s11_restore_${RANDOM}_$$"
TMP_ROOT="$(mktemp -d)"
DUMP_PATH="$TMP_ROOT/solaris.dump"
FINGERPRINTS_PATH="$TMP_ROOT/critical-fingerprints.tsv"
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

restore_url() {
  python3 - "$DB_URL" "$RESTORE_DB" <<'PY'
from urllib.parse import urlsplit, urlunsplit
import sys
parts = urlsplit(sys.argv[1])
print(urlunsplit(parts._replace(path='/' + sys.argv[2], query='', fragment='')))
PY
}

RESTORE_DB_URL="$(restore_url)"

cleanup() {
  set +e
  psql "$DB_URL" -v ON_ERROR_STOP=0 -q -c "drop database if exists \"$RESTORE_DB\" with (force);" >/dev/null 2>&1
  psql "$DB_URL" -v ON_ERROR_STOP=0 -q -c "drop schema if exists v3_s11_rehearsal cascade;" >/dev/null 2>&1
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

source_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
restore_scalar() { psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

log "Seeding local-only restore sentinel"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists v3_s11_rehearsal cascade;
create schema v3_s11_rehearsal;
create table v3_s11_rehearsal.restore_sentinel (
  id integer primary key,
  payload text not null
);
insert into v3_s11_rehearsal.restore_sentinel(id, payload)
values (1, 'solaris-v3-s11-restore-proof'), (2, 'canonical-truth-survives-restore');
SQL

log "Creating full local database dump"
pg_dump "$DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$DUMP_PATH"
[[ -s "$DUMP_PATH" ]] || fail "database dump is empty"

SNAPSHOT_SHA256="$(python3 - "$DUMP_PATH" <<'PY'
import hashlib, pathlib, sys
path = pathlib.Path(sys.argv[1])
h = hashlib.sha256()
with path.open('rb') as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b''):
        h.update(chunk)
print(h.hexdigest())
PY
)"
SNAPSHOT_BYTES="$(python3 - "$DUMP_PATH" <<'PY'
import os, sys
print(os.path.getsize(sys.argv[1]))
PY
)"

log "Creating isolated restore database"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$RESTORE_DB\" with (force);"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "create database \"$RESTORE_DB\" template template0;"

log "Restoring dump into isolated database"
pg_restore \
  --dbname="$RESTORE_DB_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$DUMP_PATH"

log "Verifying sentinel survived the restore"
[[ "$(restore_scalar "select count(*) from v3_s11_rehearsal.restore_sentinel;")" == "2" ]] \
  || fail "restore sentinel row count mismatch"
[[ "$(restore_scalar "select payload from v3_s11_rehearsal.restore_sentinel where id = 1;")" == "solaris-v3-s11-restore-proof" ]] \
  || fail "restore sentinel payload mismatch"

critical_tables=(
  public.editions
  public.shows
  public.participants
  public.entries
  public.jury_votes
  public.televote_votes
  public.results
  public.studio2_operation_receipts
  public.admin_audit_log
)

fingerprint_sql() {
  local relation="$1"
  printf "select count(*)::text || ':' || coalesce(sum(hashtextextended(row_to_json(row_value)::text, 0)::numeric), 0)::text from %s row_value;" "$relation"
}

log "Comparing critical canonical relation fingerprints"
: >"$FINGERPRINTS_PATH"
for relation in "${critical_tables[@]}"; do
  source_exists="$(source_scalar "select to_regclass('$relation') is not null;")"
  [[ "$source_exists" == "t" ]] || fail "critical source relation is missing: $relation"
  restore_exists="$(restore_scalar "select to_regclass('$relation') is not null;")"
  [[ "$restore_exists" == "t" ]] || fail "critical restored relation is missing: $relation"

  sql="$(fingerprint_sql "$relation")"
  source_fingerprint="$(source_scalar "$sql")"
  restore_fingerprint="$(restore_scalar "$sql")"
  [[ "$source_fingerprint" == "$restore_fingerprint" ]] \
    || fail "$relation fingerprint differs after restore"
  printf '%s\t%s\n' "$relation" "$restore_fingerprint" >>"$FINGERPRINTS_PATH"
  log "PASS: $relation -> $restore_fingerprint"
done

log "Comparing foreign-key validation state"
source_fk_state="$(source_scalar "select count(*)::text || ':' || count(*) filter (where convalidated)::text from pg_constraint where contype = 'f';")"
restore_fk_state="$(restore_scalar "select count(*)::text || ':' || count(*) filter (where convalidated)::text from pg_constraint where contype = 'f';")"
[[ "$source_fk_state" == "$restore_fk_state" ]] \
  || fail "foreign-key validation state differs after restore"

log "Checking canonical S2/S4 recovery evidence exists after restore"
[[ "$(restore_scalar "select to_regclass('public.studio2_operation_receipts') is not null;")" == "t" ]] \
  || fail "operation receipt ledger missing after restore"
[[ "$(restore_scalar "select to_regclass('private.v3_domain_events') is not null;")" == "t" ]] \
  || fail "domain event ledger missing after restore"
[[ "$(restore_scalar "select to_regclass('private.v3_domain_event_outbox') is not null;")" == "t" ]] \
  || fail "domain event outbox missing after restore"

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
  mkdir -p "$(dirname "$EVIDENCE_OUTPUT")"
  python3 - \
    "$EVIDENCE_OUTPUT" \
    "$(printf '%s' "$EVIDENCE_SHA" | tr '[:upper:]' '[:lower:]')" \
    "$EVIDENCE_ENVIRONMENT" \
    "$STARTED_AT" \
    "$COMPLETED_AT" \
    "$SNAPSHOT_SHA256" \
    "$SNAPSHOT_BYTES" \
    "$REHEARSAL_RTO_MS" \
    "$source_fk_state" \
    "$FINGERPRINTS_PATH" <<'PY'
import json
from pathlib import Path
import sys

(
    output_path,
    commit_sha,
    environment,
    started_at,
    completed_at,
    snapshot_sha256,
    snapshot_bytes,
    rehearsal_rto_ms,
    foreign_key_state,
    fingerprints_path,
) = sys.argv[1:]

fingerprints = {}
for line in Path(fingerprints_path).read_text(encoding="utf-8").splitlines():
    relation, fingerprint = line.split("\t", 1)
    fingerprints[relation] = fingerprint

evidence = {
    "schemaVersion": 1,
    "kind": "database_restore_rehearsal",
    "scope": "isolated_local_supabase",
    "status": "passed",
    "commitSha": commit_sha,
    "environment": environment,
    "startedAt": started_at,
    "completedAt": completed_at,
    "snapshot": {
        "format": "pg_dump_custom",
        "sha256": snapshot_sha256,
        "bytes": int(snapshot_bytes),
    },
    "achieved": {
        "exerciseRpoSeconds": 0,
        "exerciseRtoMs": int(rehearsal_rto_ms),
        "providerRpoClaim": False,
        "providerRtoClaim": False,
    },
    "validation": {
        "sentinelVerified": True,
        "criticalRelationFingerprints": fingerprints,
        "foreignKeyValidationState": foreign_key_state,
        "operationReceiptsPresent": True,
        "domainEventsPresent": True,
        "domainEventOutboxPresent": True,
    },
    "issuesFound": [],
    "followUpActions": [
        "Validate hosted/provider backup and restore capability separately before final S11 certification."
    ],
    "certificationClaim": False,
    "qaReviewRequired": True,
}

Path(output_path).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
PY
  log "Wrote exact-SHA database restore evidence to $EVIDENCE_OUTPUT"
fi

log "Database restore rehearsal passed against an isolated local target"
