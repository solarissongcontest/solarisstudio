#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-operation-receipt] %s\n' "$*"; }
fail() { printf '\n[v3-operation-receipt] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal creates destructive fixtures and is permitted only against the
# disposable local Supabase stack. Never relax these guards for CI convenience.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3OperationReceipt2026!'
HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''
LAST_TOKEN=''

json_value() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1].split(".") if sys.argv[1] else []
value = json.load(sys.stdin)
for key in path:
    if isinstance(value, list): value = value[int(key)]
    else: value = value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

expect_failure() {
  local label="$1"
  (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded with HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label rejected with HTTP $HTTP_STATUS"
}

expect_json() {
  local label="$1" path="$2" expected="$3" actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got '$actual' from $HTTP_BODY"
  log "PASS: $label"
}

create_user() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  expect_success "create auth user $email"
  LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  [[ -n "$LAST_USER_ID" ]] || fail "auth admin response for $email had no id"
}

sign_in() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$LAST_TOKEN" ]] || fail "sign-in response for $email had no token"
}

assert_local_targets() {
  case "$API_URL" in http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
  case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*|postgresql://postgres:postgres@\[::1\]:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac
}

db_value() { assert_local_targets; psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

readback_state_fingerprint() {
  db_value "select md5(jsonb_build_object(
    'receipts', (select coalesce(jsonb_agg(to_jsonb(receipt) order by receipt.operation_id), '[]'::jsonb) from public.studio2_operation_receipts receipt),
    'events', (select count(*) from private.v3_domain_events),
    'outbox', (select count(*) from private.v3_domain_event_outbox)
  )::text);"
}

expect_db_failure() {
  local label="$1" sql="$2" expected="$3" output
  if output="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$sql" 2>&1)"; then
    fail "$label unexpectedly succeeded"
  fi
  [[ "$output" == *"$expected"* ]] || fail "$label failed without $expected: $output"
  log "PASS: $label rejected as $expected"
}

claims_sql() {
  local user_id="$1"
  printf "select set_config('request.jwt.claims', jsonb_build_object('sub','%s','role','authenticated')::text, true);" "$user_id"
}

claim_sql() {
  local user_id="$1" operation_id="$2" key="$3" correlation_id="$4" request_json="$5"
  printf "begin; %s select private.studio2_claim_operation('%s','%s','%s','system.operation_receipt.rehearse','R2',jsonb_build_object('fixture','s2-operation-receipt'),'%s'::jsonb); commit;" \
    "$(claims_sql "$user_id")" "$operation_id" "$key" "$correlation_id" "$request_json"
}

ACTOR_OPERATION='00000000-0000-4000-8000-00000000b701'
RETRY_OPERATION='00000000-0000-4000-8000-00000000b702'
FAIL_OPERATION='00000000-0000-4000-8000-00000000b703'
UNCERTAIN_OPERATION='00000000-0000-4000-8000-00000000b704'
CORRELATION_ID='00000000-0000-4000-8000-00000000c701'
FIXTURE_ID='00000000-0000-4000-8000-00000000e702'
IDEMPOTENCY_KEY='v3-s2-replay-key'

log "Creating isolated operation actors"
create_user v3-operation-a@solaris.invalid; USER_A_ID="$LAST_USER_ID"
create_user v3-operation-b@solaris.invalid; USER_B_ID="$LAST_USER_ID"
sign_in v3-operation-a@solaris.invalid; USER_A_TOKEN="$LAST_TOKEN"
sign_in v3-operation-b@solaris.invalid; USER_B_TOKEN="$LAST_TOKEN"

log "Claiming and completing a canonical semantic request"
FIRST_CLAIM="$(db_value "$(claim_sql "$USER_A_ID" "$ACTOR_OPERATION" "$IDEMPOTENCY_KEY" "$CORRELATION_ID" "{\"fixtureId\":\"$FIXTURE_ID\",\"reason\":\"Verify normalized request\"}")")"
[[ "$(printf '%s' "$FIRST_CLAIM" | tail -n 1 | json_value replayed)" == 'false' ]] || fail "first claim was not new: $FIRST_CLAIM"

COMPLETED="$(db_value "begin; $(claims_sql "$USER_A_ID") select private.studio2_complete_operation('$ACTOR_OPERATION',jsonb_build_object('fixtureId','$FIXTURE_ID','state','completed')); commit;")"
[[ "$(printf '%s' "$COMPLETED" | tail -n 1 | json_value state)" == 'completed' ]] || fail "completion did not persist canonical result: $COMPLETED"

log "Replaying the same normalized request with a new operation id"
REPLAY="$(db_value "$(claim_sql "$USER_A_ID" "$RETRY_OPERATION" "$IDEMPOTENCY_KEY" '00000000-0000-4000-8000-00000000c702' "{\"reason\":\"Verify normalized request\",\"fixtureId\":\"$FIXTURE_ID\"}")")"
REPLAY_JSON="$(printf '%s' "$REPLAY" | tail -n 1)"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value replayed)" == 'true' ]] || fail "same semantic request did not replay: $REPLAY_JSON"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value operationId)" == "$ACTOR_OPERATION" ]] || fail "replay did not return original operation: $REPLAY_JSON"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value result.state)" == 'completed' ]] || fail "replay lost completed result: $REPLAY_JSON"

log "Rejecting an idempotency key reused for a changed semantic request"
expect_db_failure \
  "changed semantic request" \
  "$(claim_sql "$USER_A_ID" "$RETRY_OPERATION" "$IDEMPOTENCY_KEY" "$CORRELATION_ID" "{\"fixtureId\":\"$FIXTURE_ID\",\"reason\":\"Changed semantic request\"}")" \
  'IDEMPOTENCY_CONFLICT'

log "Recording failed and uncertain terminal receipts"
db_value "$(claim_sql "$USER_A_ID" "$FAIL_OPERATION" 'v3-s2-failed-key' "$CORRELATION_ID" "{\"fixtureId\":\"$FIXTURE_ID\",\"reason\":\"Failure fixture\"}")" >/dev/null
FAILED="$(db_value "begin; $(claims_sql "$USER_A_ID") select private.studio2_fail_operation('$FAIL_OPERATION','VALIDATION',jsonb_build_object('field','artist')); commit;")"
[[ "$(printf '%s' "$FAILED" | tail -n 1 | json_value status)" == 'failed' ]] || fail "failed receipt was not terminal: $FAILED"

db_value "$(claim_sql "$USER_A_ID" "$UNCERTAIN_OPERATION" 'v3-s2-uncertain-key' "$CORRELATION_ID" "{\"fixtureId\":\"$FIXTURE_ID\",\"reason\":\"Uncertain fixture\"}")" >/dev/null
UNCERTAIN="$(db_value "begin; $(claims_sql "$USER_A_ID") select private.studio2_mark_operation_uncertain('$UNCERTAIN_OPERATION','TIMEOUT',jsonb_build_object('dependency','participant-task')); commit;")"
[[ "$(printf '%s' "$UNCERTAIN" | tail -n 1 | json_value status)" == 'uncertain' ]] || fail "uncertain receipt was not terminal: $UNCERTAIN"

log "Reconciling only through the authenticated actor boundary"
[[ "$(db_value "select provolatile from pg_proc where oid='public.studio2_reconcile_operation(uuid)'::regprocedure;")" == 's' ]] || fail "Canonical receipt reconciliation is not STABLE"
READBACK_BEFORE="$(readback_state_fingerprint)"
request POST "$API_URL/rest/v1/rpc/studio2_reconcile_operation" "$USER_A_TOKEN" "$ANON_KEY" "{\"p_operation_id\":\"$ACTOR_OPERATION\"}"
expect_success "own operation reconciliation"
expect_json "reconciliation status" status succeeded
expect_json "reconciliation result" result.state completed
expect_json "reconciliation correlation" correlationId "$CORRELATION_ID"
FIRST_READBACK="$(printf '%s' "$HTTP_BODY" | json_value '')"

request POST "$API_URL/rest/v1/rpc/studio2_reconcile_operation" "$USER_A_TOKEN" "$ANON_KEY" "{\"p_operation_id\":\"$ACTOR_OPERATION\"}"
expect_success "repeated canonical receipt readback"
[[ "$(printf '%s' "$HTTP_BODY" | json_value '')" == "$FIRST_READBACK" ]] || fail "Repeated readback changed the authoritative receipt"

request POST "$API_URL/rest/v1/rpc/studio2_reconcile_operation" "$USER_B_TOKEN" "$ANON_KEY" "{\"p_operation_id\":\"$ACTOR_OPERATION\"}"
expect_failure "foreign actor reconciliation"
[[ "$(readback_state_fingerprint)" == "$READBACK_BEFORE" ]] || fail "Read-only reconciliation mutated receipts or enqueued new DomainEvent/outbox state"
log "PASS: canonical reconciliation preserves durable receipts and event/outbox cardinality"

expect_db_failure \
  "browser role direct private claim" \
  "begin; set local role authenticated; $(claims_sql "$USER_A_ID") select private.studio2_claim_operation('$RETRY_OPERATION','blocked-direct-call','$CORRELATION_ID','system.operation_receipt.rehearse','R2','{}'::jsonb,'{}'::jsonb); rollback;" \
  'permission denied'

log "System V3 S2 operation receipt rehearsal passed"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/v3-admin-beta-acceptance-rehearsal.sh" ]]; then
  log "Rehearsing governed Organizer acceptance evidence on the same isolated local stack"
  bash "$SCRIPT_DIR/v3-admin-beta-acceptance-rehearsal.sh"
fi
