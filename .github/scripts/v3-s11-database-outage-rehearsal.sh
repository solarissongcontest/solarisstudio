#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-database-outage] %s\n' "$*"; }
fail() { printf '\n[v3-s11-database-outage] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*" >&2; exit 1; }

# This rehearsal deliberately stops the PostgreSQL container for one disposable
# local Supabase stack. It must never be pointed at hosted/production Solaris.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

PASSWORD='V3S11DatabaseOutage2026!'
DELIVERY_ID='00000000-0000-4000-8000-00000000d811'
OPERATION_ID='00000000-0000-4000-8000-00000000b811'
IDEMPOTENCY_KEY='v3-s11-database-outage-retry'
RETRY_RPC='admin_retry_failed_notification_delivery'
HTTP_STATUS=''
HTTP_BODY=''
CURL_EXIT=0
LAST_USER_ID=''
LAST_TOKEN=''
DB_CONTAINER=''
DB_STOPPED=0

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value = value[int(key)] if isinstance(value, list) else value[key]
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
  local args=(
    -sS --connect-timeout 3 --max-time 8
    -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key"
    -H "Authorization: Bearer $bearer"
    -H 'Content-Type: application/json'
  )
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  CURL_EXIT=0
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

request_allow_transport_failure() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output status
  output="$(mktemp)"
  local args=(
    -sS --connect-timeout 2 --max-time 5
    -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key"
    -H "Authorization: Bearer $bearer"
    -H 'Content-Type: application/json'
  )
  [[ -n "$data" ]] && args+=(--data "$data")
  set +e
  status="$(curl "${args[@]}")"
  CURL_EXIT=$?
  set -e
  HTTP_STATUS="${status:-000}"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

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

retry_payload() {
  python3 -c 'import json,sys; print(json.dumps({"p_delivery_id":sys.argv[1],"p_operation_id":sys.argv[2],"p_idempotency_key":sys.argv[3]}))' \
    "$DELIVERY_ID" "$OPERATION_ID" "$IDEMPOTENCY_KEY"
}

find_local_database_container() {
  local db_port mapping mapped_port candidate
  db_port="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.urlparse(sys.argv[1]).port or "")' "$DB_URL")"
  [[ -n "$db_port" ]] || fail "Could not resolve the local database port from DB_URL"

  local matches=()
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    [[ "$candidate" == supabase_db_* ]] || continue
    while IFS= read -r mapping; do
      [[ -n "$mapping" ]] || continue
      mapped_port="${mapping##*:}"
      if [[ "$mapped_port" == "$db_port" ]]; then
        matches+=("$candidate")
        break
      fi
    done < <(docker port "$candidate" 5432/tcp 2>/dev/null || true)
  done < <(docker ps --format '{{.Names}}')

  (( ${#matches[@]} == 1 )) || fail "Expected exactly one local Supabase database container for port $db_port; found ${#matches[@]}"
  DB_CONTAINER="${matches[0]}"
}

restore_database_if_needed() {
  if [[ "$DB_STOPPED" == '1' && -n "$DB_CONTAINER" ]]; then
    docker start "$DB_CONTAINER" >/dev/null 2>&1 || true
    DB_STOPPED=0
  fi
}
trap restore_database_if_needed EXIT INT TERM

wait_for_database() {
  local attempt
  for attempt in $(seq 1 60); do
    if psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Local PostgreSQL did not recover after restart"
}

wait_for_data_api() {
  local attempt status
  for attempt in $(seq 1 60); do
    status="$(curl -sS --connect-timeout 2 --max-time 3 -o /dev/null -w '%{http_code}' \
      "$API_URL/rest/v1/notification_deliveries?id=eq.$DELIVERY_ID&select=id" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" || true)"
    if [[ "$status" == '200' ]]; then
      return 0
    fi
    sleep 1
  done
  fail "Local Data API did not recover after database restart"
}

log "Create isolated actors and a real failed notification-delivery precondition"
create_user 'v3-s11-db-outage-recipient@solaris.invalid'; RECIPIENT_USER="$LAST_USER_ID"
create_user 'v3-s11-db-outage-operator@solaris.invalid'; OPERATOR_USER="$LAST_USER_ID"
sign_in 'v3-s11-db-outage-operator@solaris.invalid'; OPERATOR_TOKEN="$LAST_TOKEN"
[[ -n "$RECIPIENT_USER" && -n "$OPERATOR_USER" && -n "$OPERATOR_TOKEN" ]] || fail "Auth fixture setup failed"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$OPERATOR_USER'::uuid,'system.manage',null);"
db_exec "
insert into public.notification_deliveries(
  id,user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
  '$DELIVERY_ID'::uuid,'$RECIPIENT_USER'::uuid,'official','official.notice','s11-db-outage',
  'v3-s11-db-outage','/notifications','S11 dependency outage fixture','',now(),'pending'
);
update public.notification_deliveries
set status='processing',processing_started_at=now(),last_attempt_at=now(),attempt_count=1,error=null
where id='$DELIVERY_ID'::uuid;
update public.notification_deliveries
set status='failed',processing_started_at=null,error='Precondition failure for S11 database-outage rehearsal'
where id='$DELIVERY_ID'::uuid;
"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_ID'::uuid;")" == 'failed' ]] || fail "failed delivery precondition missing"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid;")" == '0' ]] || fail "operation id unexpectedly exists before outage"

find_local_database_container
[[ "$DB_CONTAINER" == supabase_db_* ]] || fail "Refusing to stop non-Supabase database container $DB_CONTAINER"
log "Resolved exact disposable dependency: $DB_CONTAINER"

log "Make the real local PostgreSQL dependency unavailable"
DB_STOPPED=1
docker stop --time 1 "$DB_CONTAINER" >/dev/null
[[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER")" == 'false' ]] || fail "Local PostgreSQL container did not stop"

log "Attempt the governed R1 retry while its database dependency is unavailable"
request_allow_transport_failure POST "$API_URL/rest/v1/rpc/$RETRY_RPC" "$OPERATOR_TOKEN" "$ANON_KEY" "$(retry_payload)"
if (( CURL_EXIT == 0 && HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
  fail "Governed retry fabricated success while PostgreSQL was unavailable: HTTP $HTTP_STATUS $HTTP_BODY"
fi
log "PASS: unavailable dependency produced no successful command response (curl=$CURL_EXIT http=$HTTP_STATUS)"

log "Restore the exact local PostgreSQL dependency"
docker start "$DB_CONTAINER" >/dev/null
DB_STOPPED=0
wait_for_database
wait_for_data_api

log "Prove the outage committed neither canonical state nor an operation receipt"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_ID'::uuid;")" == 'failed' ]] || fail "Delivery changed while PostgreSQL was unavailable"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid;")" == '0' ]] || fail "Operation receipt was created during the database outage"

log "Retry the exact operation identity after dependency recovery"
request POST "$API_URL/rest/v1/rpc/$RETRY_RPC" "$OPERATOR_TOKEN" "$ANON_KEY" "$(retry_payload)"
expect_success "governed retry after database recovery"
[[ "$(printf '%s' "$HTTP_BODY" | json_value ok)" == 'true' ]] || fail "Recovered retry did not report ok=true: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value operationId)" == "$OPERATION_ID" ]] || fail "Recovered retry returned the wrong operation id: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value status)" == 'pending' ]] || fail "Recovered retry did not return pending delivery state: $HTTP_BODY"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_ID'::uuid;")" == 'pending' ]] || fail "Recovered retry did not restore the delivery to pending"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid and command='system.push.retry_failed' and status='succeeded';")" == '1' ]] || fail "Recovered retry did not create exactly one succeeded canonical receipt"

log "Replay the same operation identity and prove exactly-once convergence"
request POST "$API_URL/rest/v1/rpc/$RETRY_RPC" "$OPERATOR_TOKEN" "$ANON_KEY" "$(retry_payload)"
expect_success "idempotent retry replay after recovery"
[[ "$(printf '%s' "$HTTP_BODY" | json_value operationId)" == "$OPERATION_ID" ]] || fail "Replay returned the wrong operation id: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value status)" == 'pending' ]] || fail "Replay lost the canonical recovered result: $HTTP_BODY"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid;")" == '1' ]] || fail "Replay created a duplicate operation receipt"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$OPERATOR_USER'::uuid and command='system.push.retry_failed' and idempotency_key='$IDEMPOTENCY_KEY';")" == '1' ]] || fail "Replay created a duplicate semantic operation"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_ID'::uuid;")" == 'pending' ]] || fail "Replay changed the recovered delivery state"

log "System V3 S11 real database-dependency outage rehearsal passed"
