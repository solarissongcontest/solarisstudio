#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-confirmation-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-confirmation-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD="S5Confirmation-$(date +%s)-Aa1!"
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
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

rpc_request() {
  local token="$1" function_name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$token" "$ANON_KEY" "$body"
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
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\" = 'service_role'; $1"
}
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\" = 'service_role'; $1" >/dev/null
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

create_user() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  expect_success "create auth user $email"
  LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  [[ -n "$LAST_USER_ID" ]] || fail "auth admin response had no user id"
}

sign_in() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$LAST_TOKEN" ]] || fail "sign-in response had no access token"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c551'
EDITION_ID='00000000-0000-4000-8000-00000000e551'
ROUND_ID='00000000-0000-4000-8000-00000000a551'
REQUIREMENT_ID='00000000-0000-4000-8000-00000000b551'
SUBMIT_OPERATION_ID='00000000-0000-4000-8000-00000000d551'
FAILED_OPERATION_ID='00000000-0000-4000-8000-00000000d552'
ROUND_OPERATION_ID='00000000-0000-4000-8000-00000000d553'
SESSION_ID='s5-confirmation-session'

log "Seeding one required Confirmation and its Organizer task"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S5 Consequence Country','S5C');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S5 Confirmation Consequences',2026,'s5-confirmation-consequences',9951,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','S5 Confirmation Window','open',now()-interval '1 hour',now()+interval '1 day',true);"
db_exec "insert into public.studio2_confirmation_requirements(id,edition_id,country_id,generation,status,reason,valid_from) values ('$REQUIREMENT_ID','$EDITION_ID','$COUNTRY_ID',1,'required','S5 consequence fixture',now()-interval '5 minutes');"
db_exec "select private.studio2_reconcile_confirmation_requirement_tasks('$EDITION_ID'::uuid);"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='confirmation-requirement:$REQUIREMENT_ID';")" == 'open' ]] || fail "required Confirmation did not create an open Organizer task"

SUBMIT_BODY="{\"payload\":{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_ID\",\"instagram_username\":\"s5_consequence\",\"country\":\"S5 Consequence Country\",\"participating\":false},\"_idempotency_key\":\"$SUBMIT_OPERATION_ID\",\"_request_hash\":\"caller-hash-is-not-authority\",\"_browser_session_id\":\"$SESSION_ID\"}"

log "Submitting through the real anonymous V3 Confirmation authority"
rpc_request "$ANON_KEY" v3_submit_confirmation "$SUBMIT_BODY"
expect_success "anonymous confirmation submit"
expect_json "confirmation accepted" ok true
expect_json "new operation is not a replay" receipt.replayed false
SUBMISSION_ID="$(printf '%s' "$HTTP_BODY" | json_value submission_id)"
[[ -n "$SUBMISSION_ID" ]] || fail "successful Confirmation response had no submission id"

[[ "$(db_value "select command || ':' || status || ':' || correlation_id::text from public.studio2_operation_receipts where operation_id='$SUBMIT_OPERATION_ID'::uuid;")" == "confirmation.submit:succeeded:$SUBMIT_OPERATION_ID" ]] || fail "anonymous Confirmation was not bridged into the canonical S2 receipt"
[[ "$(db_value "select actor_id is null from public.studio2_operation_receipts where operation_id='$SUBMIT_OPERATION_ID'::uuid;")" == 't' ]] || fail "anonymous Confirmation receipt unexpectedly fabricated an actor"
[[ "$(db_value "select status from public.studio2_confirmation_requirements where id='$REQUIREMENT_ID'::uuid;")" == 'waived' ]] || fail "non-participating Confirmation did not waive the canonical requirement"

SUBMITTED_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='confirmation.submitted';")"
[[ -n "$SUBMITTED_EVENT_ID" ]] || fail "confirmation.submitted DomainEvent was not emitted"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id || ':' || aggregate_version::text from private.v3_domain_events where id='$SUBMITTED_EVENT_ID'::uuid;")" == "confirmation_submission:$SUBMISSION_ID:0" ]] || fail "confirmation.submitted aggregate provenance is wrong"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SUBMITTED_EVENT_ID'::uuid and consumer_key in ('confirmation.tasks','confirmation.notifications');")" == '2' ]] || fail "confirmation.submitted did not create both consequence deliveries"

log "Task consequence resolves stale required-confirmation work under the S4 lease"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('confirmation.tasks','s5-task-worker',1,60);")" == "$SUBMITTED_EVENT_ID" ]] || fail "confirmation.tasks could not claim submitted event"
service_exec "select public.studio2_process_confirmation_domain_event('$SUBMITTED_EVENT_ID'::uuid,'confirmation.tasks','s5-task-worker');"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='confirmation-requirement:$REQUIREMENT_ID';")" == 'resolved' ]] || fail "Confirmation task consequence did not resolve waived requirement"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$SUBMITTED_EVENT_ID'::uuid and consumer_key='confirmation.tasks';")" == '1' ]] || fail "Confirmation task consumer receipt missing"
[[ "$(service_value "select public.studio2_process_confirmation_domain_event('$SUBMITTED_EVENT_ID'::uuid,'confirmation.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Confirmation task consumer replay was not idempotent"

log "Notification consequence re-evaluates the existing deduplicating provider"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('confirmation.notifications','s5-notification-worker',1,60);")" == "$SUBMITTED_EVENT_ID" ]] || fail "confirmation.notifications could not claim submitted event"
service_exec "select public.studio2_process_confirmation_domain_event('$SUBMITTED_EVENT_ID'::uuid,'confirmation.notifications','s5-notification-worker');"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$SUBMITTED_EVENT_ID'::uuid and consumer_key='confirmation.notifications';")" == '1' ]] || fail "Confirmation notification consumer receipt missing"

log "Exact submit replay does not duplicate the event or outbox"
rpc_request "$ANON_KEY" v3_submit_confirmation "$SUBMIT_BODY"
expect_success "exact confirmation replay"
expect_json "confirmation replay reported" receipt.replayed true
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='confirmation.submitted';")" == '1' ]] || fail "Confirmation replay duplicated its DomainEvent"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SUBMITTED_EVENT_ID'::uuid;")" == '2' ]] || fail "Confirmation replay duplicated consequence deliveries"

log "Closing the window through the real governed Organizer operation"
create_user s5-confirmation-organizer@solaris.invalid
ORGANIZER_ID="$LAST_USER_ID"
sign_in s5-confirmation-organizer@solaris.invalid
ORGANIZER_TOKEN="$LAST_TOKEN"
db_exec "insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by) values ('$ORGANIZER_ID'::uuid,'organizer',null,null,null) on conflict on constraint studio2_role_assignments_scope_unique do nothing;"
ROUND_VERSION="$(db_value "select version from public.studio2_confirmation_round_versions where round_id='$ROUND_ID'::uuid;")"
[[ -n "$ROUND_VERSION" ]] || fail "Confirmation round version missing"
rpc_request "$ORGANIZER_TOKEN" studio2_apply_confirmation_round_change "{\"p_round_id\":\"$ROUND_ID\",\"p_change_kind\":\"status\",\"p_payload\":{\"status\":\"closed\"},\"p_operation_id\":\"$ROUND_OPERATION_ID\",\"p_idempotency_key\":\"s5-confirmation-window-close\",\"p_expected_version\":$ROUND_VERSION}"
expect_success "governed Confirmation window close"
expect_json "window close accepted" ok true
expect_json "window close kind" changeKind status
WINDOW_VERSION="$(printf '%s' "$HTTP_BODY" | json_value version)"

WINDOW_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$ROUND_OPERATION_ID'::uuid and event_type='confirmation.window_changed';")"
[[ -n "$WINDOW_EVENT_ID" ]] || fail "confirmation.window_changed DomainEvent was not emitted"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id || ':' || aggregate_version::text from private.v3_domain_events where id='$WINDOW_EVENT_ID'::uuid;")" == "confirmation_round:$ROUND_ID:$WINDOW_VERSION" ]] || fail "window event aggregate provenance is wrong"
[[ "$(db_value "select edition_id::text from private.v3_domain_events where id='$WINDOW_EVENT_ID'::uuid;")" == "$EDITION_ID" ]] || fail "window event lost edition scope"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$WINDOW_EVENT_ID'::uuid;")" == '2' ]] || fail "window event did not create both consequence deliveries"

[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('confirmation.tasks','s5-window-task-worker',1,60);")" == "$WINDOW_EVENT_ID" ]] || fail "window task consequence could not be claimed"
service_exec "select public.studio2_process_confirmation_domain_event('$WINDOW_EVENT_ID'::uuid,'confirmation.tasks','s5-window-task-worker');"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('confirmation.notifications','s5-window-notification-worker',1,60);")" == "$WINDOW_EVENT_ID" ]] || fail "window notification consequence could not be claimed"
service_exec "select public.studio2_process_confirmation_domain_event('$WINDOW_EVENT_ID'::uuid,'confirmation.notifications','s5-window-notification-worker');"

log "A rejected submit is not rewritten into a completed domain fact"
FAILED_SESSION='s5-confirmation-closed-session'
rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$FAILED_SESSION\",\"instagram_username\":\"closed_attempt\",\"country\":\"S5 Closed Country\",\"participating\":false},\"_idempotency_key\":\"$FAILED_OPERATION_ID\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$FAILED_SESSION\"}"
expect_success "closed-window submit returns canonical structured rejection"
expect_json "closed-window submit rejected" ok false
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$FAILED_OPERATION_ID'::uuid;")" == '0' ]] || fail "rejected submit created a completed S2 operation"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$FAILED_OPERATION_ID'::uuid;")" == '0' ]] || fail "rejected submit created a DomainEvent"

log "Browser roles cannot run event consequences"
expect_db_failure "authenticated Confirmation consequence processing" "set role authenticated; set \"request.jwt.claim.role\"='authenticated'; select public.studio2_process_confirmation_domain_event('$WINDOW_EVENT_ID'::uuid,'confirmation.tasks','browser-worker');"
expect_db_failure "anonymous Confirmation consequence processing" "set role anon; set \"request.jwt.claim.role\"='anon'; select public.studio2_process_confirmation_domain_event('$WINDOW_EVENT_ID'::uuid,'confirmation.tasks','browser-worker');"

[[ "$(db_value "select count(*) from private.v3_domain_events where event_type in ('confirmation.submitted','confirmation.window_changed');")" == '2' ]] || fail "Confirmation S5 produced an unexpected number of canonical facts"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id in ('$SUBMITTED_EVENT_ID'::uuid,'$WINDOW_EVENT_ID'::uuid) and status='completed';")" == '4' ]] || fail "Confirmation S5 consequence deliveries did not all complete"

log "System V3 S5 Confirmation consequence rehearsal passed"
