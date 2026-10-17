#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-jury-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-jury-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

HTTP_STATUS=''
HTTP_BODY=''

json_value() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1].split(".") if sys.argv[1] else []
value = json.load(sys.stdin)
for key in path:
    value = value[int(key)] if isinstance(value, list) else value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

rpc_request() {
  local function_name="$1" body="$2" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' \
    -X POST "$API_URL/rest/v1/rpc/$function_name" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

expect_json() {
  local label="$1" path="$2" expected="$3" actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got '$actual' from $HTTP_BODY"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null
}
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"
}
expect_db_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

claim_and_process() {
  local consumer_key="$1" worker_id="$2" expected_event_id="$3" claimed event_id
  claimed="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('$consumer_key','$worker_id',100,60);")"
  printf '%s\n' "$claimed" | grep -Fxq "$expected_event_id" \
    || fail "$consumer_key could not claim expected event $expected_event_id"

  while IFS= read -r event_id; do
    [[ -n "$event_id" ]] || continue
    service_exec "select public.studio2_process_jury_domain_event('$event_id'::uuid,'$consumer_key','$worker_id');"
  done <<< "$claimed"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c661'
EDITION_ID='00000000-0000-4000-8000-00000000e661'
SHOW_ID='00000000-0000-4000-8000-00000000a661'
OPEN_OPERATION_ID='00000000-0000-4000-8000-00000000d661'
DNV_OPERATION_ID='00000000-0000-4000-8000-00000000d662'
CLOSE_OPERATION_ID='00000000-0000-4000-8000-00000000d663'

log "Seeding an isolated Jury lifecycle fixture"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S5 Jury Consequence Country','J5C') on conflict (id) do nothing;"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S5 Jury Consequences',2026,'s5-jury-consequences',9961,'active',false) on conflict (id) do nothing;"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config) values ('$SHOW_ID','$EDITION_ID','S5 Jury Final','final',1,false,'{\"juryEnabled\":true,\"allowSelfVote\":true,\"juryPoints\":[]}'::jsonb) on conflict (id) do nothing;"

log "Opening Jury through the governed R2 operation emits one canonical fact"
rpc_request studio2_apply_jury_voting_status "{\"p_show_id\":\"$SHOW_ID\",\"p_status\":\"open\",\"p_operation_id\":\"$OPEN_OPERATION_ID\",\"p_idempotency_key\":\"s5-jury-open\",\"p_expected_version\":0}"
expect_success "governed Jury open"
expect_json "Jury open result" status open
OPEN_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$OPEN_OPERATION_ID'::uuid and event_type='jury.opened';")"
[[ -n "$OPEN_EVENT_ID" ]] || fail "jury.opened DomainEvent missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT_ID'::uuid and consumer_key in ('jury.tasks','jury.notifications');")" == '2' ]] || fail "jury.opened did not create both consequence deliveries"
[[ "$(db_value "select payload ? 'points' or payload ? 'awards' from private.v3_domain_events where id='$OPEN_EVENT_ID'::uuid;")" == 'f' ]] || fail "Jury event leaked ballot scoring data"

log "Jury task and notification consequences execute under leased service-role consumers"
claim_and_process 'jury.tasks' 's5-jury-task-worker' "$OPEN_EVENT_ID"
claim_and_process 'jury.notifications' 's5-jury-notification-worker' "$OPEN_EVENT_ID"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$OPEN_EVENT_ID'::uuid;")" == '2' ]] || fail "Jury consumer receipts missing"
[[ "$(service_value "select public.studio2_process_jury_domain_event('$OPEN_EVENT_ID'::uuid,'jury.tasks','s5-jury-replay-worker')->>'replayed';")" == 'true' ]] || fail "Jury task consequence replay was not idempotent"

log "Exact Jury operation replay does not duplicate events or deliveries"
rpc_request studio2_apply_jury_voting_status "{\"p_show_id\":\"$SHOW_ID\",\"p_status\":\"open\",\"p_operation_id\":\"$OPEN_OPERATION_ID\",\"p_idempotency_key\":\"s5-jury-open\",\"p_expected_version\":0}"
expect_success "exact Jury open replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPEN_OPERATION_ID'::uuid and event_type='jury.opened';")" == '1' ]] || fail "Jury open replay duplicated its DomainEvent"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT_ID'::uuid;")" == '2' ]] || fail "Jury open replay duplicated deliveries"

log "Authorizing did-not-vote through the governed R2 operation emits jury.ballot_changed"
rpc_request studio2_apply_jury_dnv "{\"p_show_id\":\"$SHOW_ID\",\"p_voter_id\":null,\"p_voter_country_id\":\"$COUNTRY_ID\",\"p_voter_entity_id\":null,\"p_action\":\"set\",\"p_reason\":\"S5 runtime consequence rehearsal\",\"p_operation_id\":\"$DNV_OPERATION_ID\",\"p_idempotency_key\":\"s5-jury-dnv-set\",\"p_expected_version\":0}"
expect_success "governed Jury DNV set"
expect_json "Jury DNV result" dnv true
DNV_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$DNV_OPERATION_ID'::uuid and event_type='jury.ballot_changed';")"
[[ -n "$DNV_EVENT_ID" ]] || fail "jury.ballot_changed DomainEvent missing for DNV"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$DNV_EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '1' ]] || fail "jury.ballot_changed task delivery missing"
claim_and_process 'jury.tasks' 's5-jury-dnv-task-worker' "$DNV_EVENT_ID"

log "Closing Jury through the governed R2 operation emits jury.closed"
WINDOW_VERSION="$(db_value "select version from public.studio2_jury_window_versions where edition_id='$EDITION_ID'::uuid;")"
[[ -n "$WINDOW_VERSION" ]] || fail "Jury window version missing after open"
rpc_request studio2_apply_jury_voting_status "{\"p_show_id\":\"$SHOW_ID\",\"p_status\":\"closed\",\"p_operation_id\":\"$CLOSE_OPERATION_ID\",\"p_idempotency_key\":\"s5-jury-close\",\"p_expected_version\":$WINDOW_VERSION}"
expect_success "governed Jury close"
expect_json "Jury close result" status closed
CLOSE_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$CLOSE_OPERATION_ID'::uuid and event_type='jury.closed';")"
[[ -n "$CLOSE_EVENT_ID" ]] || fail "jury.closed DomainEvent missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$CLOSE_EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '1' ]] || fail "jury.closed task delivery missing"
claim_and_process 'jury.tasks' 's5-jury-close-task-worker' "$CLOSE_EVENT_ID"

log "Browser roles cannot invoke Jury consequence consumers"
expect_db_failure "authenticated Jury consequence processing" "set role authenticated; set \"request.jwt.claim.role\"='authenticated'; select public.studio2_process_jury_domain_event('$CLOSE_EVENT_ID'::uuid,'jury.tasks','browser-worker');"

log "System V3 S5 Jury consequence rehearsal passed"
