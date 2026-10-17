#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s10-sli] %s\n' "$*"; }
fail() { printf '\n[v3-s10-sli] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() { local label="$1" query="$2"; if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then fail "$label unexpectedly succeeded"; fi; log "PASS: $label rejected"; }

ADMIN_ID='00000000-0000-4000-8000-00000000a981'
USER_ID='00000000-0000-4000-8000-00000000a982'
OP_SUCCESS='00000000-0000-4000-8000-00000000a983'
OP_FAILED='00000000-0000-4000-8000-00000000a984'
OP_PROCESSING='00000000-0000-4000-8000-00000000a985'
EVENT_ID='00000000-0000-4000-8000-00000000a986'

log "Seeding bounded local S2/S4 telemetry fixtures"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
  ('$ADMIN_ID','authenticated','authenticated','s10-admin@local.invalid',now(),now()),
  ('$USER_ID','authenticated','authenticated','s10-user@local.invalid',now(),now());
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ADMIN_ID'::uuid,'system.read',null);
insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at
) values (
  '$OP_SUCCESS','$ADMIN_ID','s10-success','$OP_SUCCESS',repeat('a',64),'s10.success','R1','{}','succeeded','{}',now()
);
insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at,error_code,error_metadata
) values (
  '$OP_FAILED','$ADMIN_ID','s10-failed','$OP_FAILED',repeat('b',64),'s10.failed','R1','{}','failed',null,now(),'DEPENDENCY_FAILURE','{}'
);
insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status
) values (
  '$OP_PROCESSING','$ADMIN_ID','s10-processing','$OP_PROCESSING',repeat('c',64),'s10.processing','R1','{}','processing'
);
insert into private.v3_domain_events(
  id,event_type,aggregate_type,aggregate_id,aggregate_version,operation_id,correlation_id,actor_id,occurred_at,payload
) values (
  '$EVENT_ID','s10.measured','sli','baseline',1,'$OP_SUCCESS','$OP_SUCCESS','$ADMIN_ID',now()-interval '2 seconds','{}'
);
insert into private.v3_domain_event_outbox(event_id,consumer_key,status,attempt_count,completed_at)
values ('$EVENT_ID','s10.completed','completed',2,now());
insert into private.v3_domain_event_outbox(event_id,consumer_key,status,attempt_count,last_error_code,last_error_metadata,dead_lettered_at)
values ('$EVENT_ID','s10.dead-letter','dead_letter',8,'DEPENDENCY_FAILURE','{}',now());
insert into private.v3_domain_event_outbox(event_id,consumer_key,status,attempt_count)
values ('$EVENT_ID','s10.pending','pending',0);
"

log "Authorization and bounded measurement window"
db_expect_failure "ordinary user SLI snapshot" "set role authenticated; set request.jwt.claim.sub = '$USER_ID'; select public.admin_system_v3_sli_snapshot(60);"
db_expect_failure "too-small SLI window" "set role authenticated; set request.jwt.claim.sub = '$ADMIN_ID'; select public.admin_system_v3_sli_snapshot(1);"
db_expect_failure "too-large SLI window" "set role authenticated; set request.jwt.claim.sub = '$ADMIN_ID'; select public.admin_system_v3_sli_snapshot(10081);"

SNAPSHOT="$(db_scalar "set role authenticated; set request.jwt.claim.sub = '$ADMIN_ID'; select public.admin_system_v3_sli_snapshot(60)::text;")"
python3 - "$SNAPSHOT" <<'PY'
import json,sys
s=json.loads(sys.argv[1])
assert s['schemaVersion'] == 2
assert s['windowMinutes'] == 60
assert s['source']['projection'] == 'admin_system_observability_snapshot'
assert s['coverage']['state'] == 'foundation'
assert 'operation_outcomes' in s['coverage']['measured']
assert 'authoritative_submission_latency' in s['coverage']['remaining']
assert s['operations']['total'] == 3
assert s['operations']['completed'] == 2
assert s['operations']['succeeded'] == 1
assert s['operations']['failed'] == 1
assert s['operations']['uncertain'] == 0
assert s['operations']['processing'] == 1
assert float(s['operations']['successRatio']) == 0.5
assert s['domainEvents']['emitted'] == 1
assert s['consequences']['total'] == 3
assert s['consequences']['pending'] == 1
assert s['consequences']['processing'] == 0
assert s['consequences']['completed'] == 1
assert s['consequences']['deadLetter'] == 1
assert s['consequences']['retried'] == 2
assert s['consequences']['attempts'] == 10
assert s['consequences']['averageCompletedLagMs'] >= 1000
assert s['consequences']['p95CompletedLagMs'] >= 1000
assert s['consequences']['maxCompletedLagMs'] >= 1000
assert s['consequences']['oldestActionableAgeSeconds'] >= 0
assert s['targets'] is None
assert s['errorBudgets'] is None
assert s['alerts'] is None
PY
log "PASS: S10 reuses S9 measurements and exposes no invented targets"

log "All S10 SLI foundation checks passed"
