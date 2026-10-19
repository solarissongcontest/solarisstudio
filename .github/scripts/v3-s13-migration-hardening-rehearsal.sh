#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s13-migration-hardening] %s\n' "$*"; }
fail() { printf '\n[v3-s13-migration-hardening] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}
service_scalar() {
  db_scalar "set role service_role; set request.jwt.claim.role = 'service_role'; $1"
}
service_exec() {
  db_exec "set role service_role; set request.jwt.claim.role = 'service_role'; $1"
}

MIGRATION_KEY='test.s13.backfill'
BACKFILL_KEY='test.s13.backfill.rows'
WORKER_A='s13-worker-a'
WORKER_B='s13-worker-b'

log "Public compatibility projection is readable without exposing mutation authority"
COMPAT="$(db_scalar "set role anon; set request.jwt.claim.role = 'anon'; select public.v3_schema_compatibility(1)::text;")"
python3 - "$COMPAT" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['serverSchemaVersion'] == 1
assert payload['minClientSchemaVersion'] == 1
assert payload['maxClientSchemaVersion'] == 1
assert payload['status'] == 'compatible'
assert payload['phase'] == 'expand'
PY
log "PASS: compatibility projection returns bounded version state"

db_expect_failure "anonymous migration registration" \
  "set role anon; set request.jwt.claim.role = 'anon'; select public.v3_register_migration_contract('$MIGRATION_KEY',1,'forward_fix_only',false,'$BACKFILL_KEY','test');"

log "Registering one explicit migration contract"
REGISTERED="$(service_scalar "select public.v3_register_migration_contract('$MIGRATION_KEY',1,'forward_fix_only',false,'$BACKFILL_KEY','S13 isolated rehearsal')::text;")"
python3 - "$REGISTERED" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['migrationKey'] == 'test.s13.backfill'
assert payload['schemaVersion'] == 1
assert payload['rollbackMode'] == 'forward_fix_only'
assert payload['backfillKey'] == 'test.s13.backfill.rows'
assert payload['replayed'] is False
PY
REPLAY="$(service_scalar "select public.v3_register_migration_contract('$MIGRATION_KEY',1,'forward_fix_only',false,'$BACKFILL_KEY','S13 isolated rehearsal')::text;")"
python3 - "$REPLAY" <<'PY'
import json, sys
assert json.loads(sys.argv[1])['replayed'] is True
PY
log "PASS: migration contract registration is semantic-idempotent"

db_expect_failure "orphan backfill claim" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_claim_backfill('test.s13.orphan',1,2,'worker',30,1);"

log "Starting compatibility doctrine at expand"
service_exec "select public.v3_set_schema_compatibility(1,1,1,'expand','$MIGRATION_KEY','begin isolated S13 rehearsal');"
db_expect_failure "phase skipping" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_set_schema_compatibility(1,1,1,'dual-compatible','$MIGRATION_KEY','skip');"
service_exec "select public.v3_set_schema_compatibility(1,1,1,'backfill','$MIGRATION_KEY','bounded backfill begins');"

log "Claiming first bounded batch"
FIRST="$(service_scalar "select public.v3_claim_backfill('$BACKFILL_KEY',1,2,'$WORKER_A',300,3)::text;")"
python3 - "$FIRST" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['claimed'] is True
assert payload['status'] == 'running'
assert payload['batchSize'] == 2
assert payload['processedCount'] == 0
assert payload['expectedCount'] == 3
assert payload['cursor'] == {}
PY

db_expect_failure "concurrent foreign-worker claim" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_claim_backfill('$BACKFILL_KEY',1,2,'$WORKER_B',300,3);"
db_expect_failure "checkpoint larger than claimed batch" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_checkpoint_backfill('$BACKFILL_KEY','$WORKER_A','{\"lastId\":3}'::jsonb,3,0,null,false);"

CHECKPOINT="$(service_scalar "select public.v3_checkpoint_backfill('$BACKFILL_KEY','$WORKER_A','{\"lastId\":2}'::jsonb,2,0,null,false)::text;")"
python3 - "$CHECKPOINT" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['status'] == 'pending'
assert payload['processedCount'] == 2
assert payload['expectedCount'] == 3
assert payload['cursor'] == {'lastId': 2}
PY
log "PASS: checkpoint yields the lease and preserves resumable cursor"

SECOND="$(service_scalar "select public.v3_claim_backfill('$BACKFILL_KEY',1,2,'$WORKER_B',300,3)::text;")"
python3 - "$SECOND" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['claimed'] is True
assert payload['processedCount'] == 2
assert payload['cursor'] == {'lastId': 2}
PY

db_expect_failure "premature completed checkpoint" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_checkpoint_backfill('$BACKFILL_KEY','$WORKER_B','{\"lastId\":2}'::jsonb,0,0,null,true);"
FINAL="$(service_scalar "select public.v3_checkpoint_backfill('$BACKFILL_KEY','$WORKER_B','{\"lastId\":3}'::jsonb,1,0,null,true)::text;")"
python3 - "$FINAL" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['status'] == 'completed'
assert payload['processedCount'] == 3
assert payload['expectedCount'] == 3
assert payload['cursor'] == {'lastId': 3}
assert payload['completedAt'] is not None
PY

COMPLETED_REPLAY="$(service_scalar "select public.v3_claim_backfill('$BACKFILL_KEY',1,2,'$WORKER_A',300,3)::text;")"
python3 - "$COMPLETED_REPLAY" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['claimed'] is False
assert payload['replayed'] is True
assert payload['status'] == 'completed'
assert payload['processedCount'] == 3
PY
log "PASS: completed backfill claim replays without amplifying work"

service_exec "select public.v3_set_schema_compatibility(1,1,1,'dual-compatible','$MIGRATION_KEY','old and new paths agree during isolated rehearsal');"

db_expect_failure "parity against wrong backfill key" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_record_migration_parity('$MIGRATION_KEY',null,3,3,0,0,0,'{}'::jsonb);"

log "Recording failing parity and proving cutover is blocked"
FAILED_PARITY="$(service_scalar "select public.v3_record_migration_parity('$MIGRATION_KEY','$BACKFILL_KEY',3,2,1,0,0,'{\"source\":\"s13-rehearsal\"}'::jsonb)::text;")"
python3 - "$FAILED_PARITY" <<'PY'
import json, sys
payload=json.loads(sys.argv[1])
assert payload['expected'] == 3
assert payload['actual'] == 2
assert payload['missing'] == 1
assert payload['passed'] is False
PY

db_expect_failure "cutover without passing parity" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_set_schema_compatibility(1,1,1,'switch','$MIGRATION_KEY','must fail');"

log "Recording passing parity and advancing one phase at a time"
PASSED_PARITY="$(service_scalar "select public.v3_record_migration_parity('$MIGRATION_KEY','$BACKFILL_KEY',3,3,0,0,0,'{\"source\":\"s13-rehearsal\"}'::jsonb)::text;")"
python3 - "$PASSED_PARITY" <<'PY'
import json, sys
assert json.loads(sys.argv[1])['passed'] is True
PY
service_exec "select public.v3_set_schema_compatibility(1,1,1,'switch','$MIGRATION_KEY','passing parity permits cutover');"
service_exec "select public.v3_set_schema_compatibility(1,1,1,'validate','$MIGRATION_KEY','post-cutover validation');"
service_exec "select public.v3_set_schema_compatibility(1,1,1,'contract','$MIGRATION_KEY','compatibility window retired');"

db_expect_failure "backward phase transition" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_set_schema_compatibility(1,1,1,'validate','$MIGRATION_KEY','backwards');"

service_exec "select public.v3_register_migration_contract('test.s13.version3',3,'forward_fix_only',false,null,'version skip guard');"
db_expect_failure "schema version skipping" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.v3_set_schema_compatibility(3,1,3,'expand','test.s13.version3','skip version two');"

HISTORY_COUNT="$(db_scalar "select count(*) from private.v3_schema_compatibility_history where migration_key = '$MIGRATION_KEY';")"
[[ "$HISTORY_COUNT" -ge 6 ]] || fail "expected compatibility transition history, got $HISTORY_COUNT rows"
LATEST_PARITY="$(db_scalar "select passed::text from private.v3_migration_parity_runs where migration_key = '$MIGRATION_KEY' order by sequence desc limit 1;")"
[[ "$LATEST_PARITY" == "true" ]] || fail "latest migration parity should pass"

log "All S13 migration hardening checks passed"
