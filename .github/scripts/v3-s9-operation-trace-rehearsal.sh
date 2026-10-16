#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s9-operation-trace] %s\n' "$*"; }
fail() { printf '\n[v3-s9-operation-trace] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() { local label="$1" query="$2"; if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then fail "$label unexpectedly succeeded"; fi; log "PASS: $label rejected"; }

ADMIN_ID='00000000-0000-4000-8000-00000000a911'
USER_ID='00000000-0000-4000-8000-00000000a912'
OPERATION_ID='00000000-0000-4000-8000-00000000a901'
CORRELATION_ID='00000000-0000-4000-8000-00000000a902'
EVENT_ID='00000000-0000-4000-8000-00000000a903'
SECRET='S9_PRIVATE_PAYLOAD_MUST_NOT_LEAK'

log "Seeding isolated trace state"
db_exec "insert into auth.users(id,aud,role,email,created_at,updated_at) values ('$ADMIN_ID','authenticated','authenticated','s9-admin@local.invalid',now(),now()),('$USER_ID','authenticated','authenticated','s9-user@local.invalid',now(),now()); insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$ADMIN_ID'::uuid,'system.read',null); insert into public.studio2_operation_receipts(operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at) values ('$OPERATION_ID','$ADMIN_ID','s9-trace-test','$CORRELATION_ID',repeat('a',64),'test.trace','R2','{}'::jsonb,'succeeded',jsonb_build_object('secret','$SECRET'),now()); insert into private.v3_domain_events(id,event_type,aggregate_type,aggregate_id,aggregate_version,operation_id,correlation_id,actor_id,payload) values ('$EVENT_ID','test.traced','test','trace-target',1,'$OPERATION_ID','$CORRELATION_ID','$ADMIN_ID',jsonb_build_object('secret','$SECRET')); insert into private.v3_domain_event_outbox(event_id,consumer_key,status,attempt_count,completed_at) values ('$EVENT_ID','trace.completed','completed',1,now()); insert into private.v3_domain_event_consumer_receipts(event_id,consumer_key,result_metadata) values ('$EVENT_ID','trace.completed',jsonb_build_object('secret','$SECRET')); insert into private.v3_domain_event_outbox(event_id,consumer_key,status,attempt_count,last_error_code,last_error_metadata,dead_lettered_at) values ('$EVENT_ID','trace.dead-letter','dead_letter',8,'DEPENDENCY_FAILURE',jsonb_build_object('secret','$SECRET'),now());"

log "Function-level authorization"
db_expect_failure "anonymous operation trace" "set role anon; set request.jwt.claim.sub = ''; select public.admin_system_operation_trace('$OPERATION_ID');"
db_expect_failure "ordinary user operation trace" "set role authenticated; set request.jwt.claim.sub = '$USER_ID'; select public.admin_system_operation_trace('$OPERATION_ID');"

log "Authorized trace correlates operation, event and delivery lifecycle"
TRACE="$(db_scalar "set role authenticated; set request.jwt.claim.sub = '$ADMIN_ID'; select public.admin_system_operation_trace('$OPERATION_ID')::text;")"
python3 - "$TRACE" "$OPERATION_ID" "$CORRELATION_ID" "$EVENT_ID" "$SECRET" <<'PY'
import json,sys
trace=json.loads(sys.argv[1])
operation_id, correlation_id, event_id, secret = sys.argv[2:]
assert trace['operation']['operationId'] == operation_id
assert trace['operation']['correlationId'] == correlation_id
assert trace['events'][0]['eventId'] == event_id
assert trace['summary']['eventCount'] == 1
assert trace['summary']['completedDeliveries'] == 1
assert trace['summary']['deadLetterDeliveries'] == 1
serialized=json.dumps(trace, sort_keys=True)
assert secret not in serialized
assert 'request_fingerprint' not in serialized
assert 'last_error_metadata' not in serialized
assert 'result_metadata' not in serialized
PY
log "PASS: authorized trace has correlation and no private payload metadata"

db_expect_failure "unknown exact operation" "set role authenticated; set request.jwt.claim.sub = '$ADMIN_ID'; select public.admin_system_operation_trace('00000000-0000-4000-8000-00000000ffff');"

log "All S9 operation trace checks passed"
