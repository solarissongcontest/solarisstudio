#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-dependency-outage] %s\n' "$*"; }
fail() { printf '\n[v3-s11-dependency-outage] FAIL: %s\n' "$*" >&2; exit 1; }

for command_name in supabase psql node bun; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal ($DB_URL)" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

TMP_DIR="$(mktemp -d)"
READY_FILE="$TMP_DIR/dependency-ready.json"
DEPENDENCY_PID=''
DEPENDENCY_PORT='0'
DEPENDENCY_URL=''

cleanup() {
  if [[ -n "$DEPENDENCY_PID" ]] && kill -0 "$DEPENDENCY_PID" >/dev/null 2>&1; then
    kill "$DEPENDENCY_PID" >/dev/null 2>&1 || true
    wait "$DEPENDENCY_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

probe_dependency() {
  bun run scripts/v3-s11-probe-dependency.ts "$DEPENDENCY_URL" | tr -d '\r\n'
}

start_dependency() {
  rm -f "$READY_FILE"
  V3_S11_DEPENDENCY_READY_FILE="$READY_FILE" \
  V3_S11_DEPENDENCY_PORT="$DEPENDENCY_PORT" \
    node scripts/v3-s11-loopback-dependency.mjs &
  DEPENDENCY_PID=$!

  for ((attempt = 0; attempt < 50; attempt += 1)); do
    [[ -s "$READY_FILE" ]] && break
    kill -0 "$DEPENDENCY_PID" >/dev/null 2>&1 \
      || fail "loopback dependency exited before becoming ready"
    sleep 0.1
  done
  [[ -s "$READY_FILE" ]] || fail "loopback dependency did not become ready"

  local observed_port observed_url
  observed_port="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(value.port));' "$READY_FILE")"
  observed_url="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(value.url));' "$READY_FILE")"
  [[ "$observed_port" =~ ^[0-9]+$ ]] || fail "loopback dependency reported an invalid port"

  if [[ "$DEPENDENCY_PORT" == '0' ]]; then
    DEPENDENCY_PORT="$observed_port"
  elif [[ "$DEPENDENCY_PORT" != "$observed_port" ]]; then
    fail "restored dependency did not bind the original port"
  fi
  DEPENDENCY_URL="$observed_url"
  case "$DEPENDENCY_URL" in
    http://127.0.0.1:"$DEPENDENCY_PORT"/health) ;;
    *) fail "loopback dependency reported a non-isolated URL ($DEPENDENCY_URL)" ;;
  esac

  [[ "$(probe_dependency)" == 'OK' ]] || fail "loopback dependency health probe failed"
}

stop_dependency() {
  [[ -n "$DEPENDENCY_PID" ]] || fail "loopback dependency is not running"
  kill "$DEPENDENCY_PID"
  wait "$DEPENDENCY_PID"
  DEPENDENCY_PID=''
}

OPERATION_ID='00000000-0000-4000-8000-00000000b111'
CONSUMER_KEY='recovery.s11.dependency'
WORKER_OUTAGE='s11-dependency-outage-worker'
WORKER_RECOVER='s11-dependency-recovery-worker'

log "Start a real isolated loopback dependency"
start_dependency
ORIGINAL_DEPENDENCY_PORT="$DEPENDENCY_PORT"

log "Seed one canonical S4 delivery whose consumer depends on that service"
db_exec "
insert into public.studio2_operation_receipts (
  operation_id, actor_id, idempotency_key, correlation_id,
  request_fingerprint, command, risk_class, scope, status
) values (
  '$OPERATION_ID'::uuid, null, 's11-real-dependency-outage', '$OPERATION_ID'::uuid,
  repeat('d', 64), 'v3.s11.real_dependency_outage', 'R2', '{}'::jsonb, 'processing'
)
on conflict (operation_id) do nothing;
"
EVENT_ID="$(db_value "select private.v3_emit_domain_event(
  'entry.reviewed', 'entry', 's11-dependency-fixture', 1, '$OPERATION_ID'::uuid,
  null, null, '{\"source\":\"s11-real-dependency-outage\"}'::jsonb, 1,
  array['$CONSUMER_KEY']::text[]
);")"
[[ -n "$EVENT_ID" ]] || fail "event id missing"

[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('$CONSUMER_KEY','$WORKER_OUTAGE',1,60);")" == "$EVENT_ID" ]] \
  || fail "dependency consumer initial claim failed"

log "Make the actual dependency unavailable and classify the observed network failure"
stop_dependency
DEPENDENCY_ERROR_CODE="$(probe_dependency)"
[[ "$DEPENDENCY_ERROR_CODE" == 'DEPENDENCY_FAILURE' ]] \
  || fail "real dependency outage classified as $DEPENDENCY_ERROR_CODE instead of DEPENDENCY_FAILURE"

log "Persist the observed outage through the canonical S4 failure boundary"
service_exec "select public.studio2_fail_domain_event_delivery(
  '$EVENT_ID'::uuid,
  '$CONSUMER_KEY',
  '$WORKER_OUTAGE',
  '$DEPENDENCY_ERROR_CODE',
  '{\"dependency\":\"s11.loopback\",\"observation\":\"real_connection_failure\"}'::jsonb,
  0,
  2
);"
[[ "$(db_value "select status || ':' || attempt_count || ':' || coalesce(last_error_code,'') from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'pending:1:DEPENDENCY_FAILURE' ]] \
  || fail "canonical delivery did not retain the real dependency failure and retry state"
[[ "$(db_value "select last_error_metadata->>'observation' from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'real_connection_failure' ]] \
  || fail "canonical delivery did not retain dependency outage evidence"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$EVENT_ID'::uuid;")" == '1' ]] \
  || fail "canonical DomainEvent was lost during dependency failure"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '0' ]] \
  || fail "failed dependency delivery created a consumer receipt"

log "Restore the dependency at the same endpoint and prove canonical recovery convergence"
DEPENDENCY_PORT="$ORIGINAL_DEPENDENCY_PORT"
start_dependency
[[ "$DEPENDENCY_PORT" == "$ORIGINAL_DEPENDENCY_PORT" ]] \
  || fail "dependency recovery changed the endpoint"
[[ "$(probe_dependency)" == 'OK' ]] || fail "restored dependency is still unavailable"

[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('$CONSUMER_KEY','$WORKER_RECOVER',1,60);")" == "$EVENT_ID" ]] \
  || fail "recovered dependency delivery could not be reclaimed"
[[ "$(db_value "select attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '2' ]] \
  || fail "recovery claim did not advance preserved attempt history"

RECOVERY_RESULT="$(service_value "select public.studio2_complete_domain_event_delivery(
  '$EVENT_ID'::uuid,
  '$CONSUMER_KEY',
  '$WORKER_RECOVER',
  '{\"dependencyRecovered\":true,\"dependencyHost\":\"127.0.0.1\"}'::jsonb
)->>'replayed';")"
[[ "$RECOVERY_RESULT" == 'false' ]] || fail "first recovery completion was reported as replay"
[[ "$(db_value "select status || ':' || attempt_count || ':' || coalesce(last_error_code,'') from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'completed:2:DEPENDENCY_FAILURE' ]] \
  || fail "successful recovery did not preserve canonical attempt/error history"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '1' ]] \
  || fail "dependency recovery did not create exactly one immutable consumer receipt"
[[ "$(db_value "select (result_metadata->>'dependencyRecovered')::boolean from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 't' ]] \
  || fail "dependency recovery receipt metadata missing"

log "Replay the completion to prove exactly-once convergence"
REPLAY_RESULT="$(service_value "select public.studio2_complete_domain_event_delivery(
  '$EVENT_ID'::uuid,
  '$CONSUMER_KEY',
  '$WORKER_RECOVER',
  '{\"different\":\"ignored-on-replay\"}'::jsonb
)->>'replayed';")"
[[ "$REPLAY_RESULT" == 'true' ]] || fail "duplicate completion did not report replay"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '1' ]] \
  || fail "duplicate recovery completion created another consumer receipt"
[[ "$(db_value "select (result_metadata->>'dependencyRecovered')::boolean from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 't' ]] \
  || fail "duplicate recovery completion rewrote the immutable receipt"

log "PASS: real loopback dependency outage classified as DEPENDENCY_FAILURE and recovered exactly once with canonical failure history preserved"
