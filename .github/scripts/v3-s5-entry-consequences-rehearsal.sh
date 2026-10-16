#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-entry-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-entry-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Hostile mutation traffic is allowed only against the disposable local stack.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S5EntryConsequences2026!'
HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''
LAST_TOKEN=''

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in (sys.argv[1].split(".") if sys.argv[1] else []):
    value = value[int(key)] if isinstance(value, list) else value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$output")"
  rm -f "$output"
}

rpc() { request POST "$API_URL/rest/v1/rpc/$2" "$1" "$ANON_KEY" "$3"; }
expect_success() { (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$1 returned HTTP $HTTP_STATUS: $HTTP_BODY"; log "PASS: $1"; }
expect_failure() { (( HTTP_STATUS >= 400 )) || fail "$1 unexpectedly succeeded: $HTTP_BODY"; log "PASS: $1 rejected"; }
expect_json() {
  local actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$2")"
  [[ "$actual" == "$3" ]] || fail "$1 expected $2=$3, got '$actual' from $HTTP_BODY"
}
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

claim_and_process() {
  local worker_id="$1" expected_event_id="$2" claimed event_id
  claimed="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('entry.tasks','$worker_id',100,60);")"
  printf '%s\n' "$claimed" | grep -Fxq "$expected_event_id" \
    || fail "entry.tasks could not claim expected event $expected_event_id"
  while IFS= read -r event_id; do
    [[ -n "$event_id" ]] || continue
    service_exec "select public.studio2_process_entry_domain_event('$event_id'::uuid,'entry.tasks','$worker_id');"
  done <<< "$claimed"
}

create_user() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  expect_success "create $email"
  LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
}

sign_in() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c851'
EDITION_ID='00000000-0000-4000-8000-00000000e851'
ROUND_ID='00000000-0000-4000-8000-00000000a851'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f851'
ENTRY_ID='00000000-0000-4000-8000-00000000d851'
CHANGES_OPERATION_ID='00000000-0000-4000-8000-00000000b851'
REPLAY_OPERATION_ID='00000000-0000-4000-8000-00000000b852'
REVIEW_OPERATION_ID='00000000-0000-4000-8000-00000000b853'
CORRELATION_ID='00000000-0000-4000-8000-00000000c852'

log "Creating an isolated Organizer and canonical Entry"
create_user v3-s5-entry-organizer@solaris.invalid; ORGANIZER_ID="$LAST_USER_ID"
sign_in v3-s5-entry-organizer@solaris.invalid; ORGANIZER_TOKEN="$LAST_TOKEN"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S5 Entry Country','S5E');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S5 Entry Consequences',2026,'s5-entry-consequences',9851,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','S5 Entry round','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method,editing_allowed,browser_session_id) values ('$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','s5entry','S5 Entry Country',true,'internal',true,'s5-entry-session');"
db_exec "insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values ('$ENTRY_ID','$SUBMISSION_ID','S5 artist','S5 song','https://example.invalid/s5-entry');"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$ORGANIZER_ID','confirmation.manage','$EDITION_ID');"

ENTRY_VERSION="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"
EXPECTED_VERSION="$(db_value "select version from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID';")"

log "Requesting changes through the canonical S2 Entry command"
CHANGES_BODY="{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"declined\",\"p_reason\":\"Correct the artist credit\",\"p_operation_id\":\"$CHANGES_OPERATION_ID\",\"p_idempotency_key\":\"s5-entry-changes\",\"p_expected_version\":$EXPECTED_VERSION,\"p_expected_entry_version\":\"$ENTRY_VERSION\",\"p_correlation_id\":\"$CORRELATION_ID\"}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$CHANGES_BODY"
expect_success "entry.request_changes"
expect_json "request changes command" command entry.request_changes
expect_json "request changes succeeded" status succeeded

CHANGES_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$CHANGES_OPERATION_ID'::uuid and event_type='entry.changes_requested';")"
[[ -n "$CHANGES_EVENT_ID" ]] || fail "entry.changes_requested DomainEvent was not emitted"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id || ':' || aggregate_version::text from private.v3_domain_events where id='$CHANGES_EVENT_ID'::uuid;")" == "entry_review:$ENTRY_ID:$((EXPECTED_VERSION + 1))" ]] || fail "Entry changes-requested aggregate provenance is wrong"
[[ "$(db_value "select edition_id::text || ':' || correlation_id::text from private.v3_domain_events where id='$CHANGES_EVENT_ID'::uuid;")" == "$EDITION_ID:$CORRELATION_ID" ]] || fail "Entry event lost edition or correlation provenance"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$CHANGES_EVENT_ID'::uuid and consumer_key='entry.tasks';")" == '1' ]] || fail "Entry task delivery was not written transactionally"

claim_and_process 's5-entry-task-worker' "$CHANGES_EVENT_ID"
[[ "$(db_value "select result_metadata->>'effect' from private.v3_domain_event_consumer_receipts where event_id='$CHANGES_EVENT_ID'::uuid and consumer_key='entry.tasks';")" == 'entry-task-reconciliation' ]] || fail "Entry task consequence receipt is missing"
[[ "$(service_value "select public.studio2_process_entry_domain_event('$CHANGES_EVENT_ID'::uuid,'entry.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Entry task consequence replay was not idempotent"

log "Exact command replay does not duplicate the fact or delivery"
REPLAY_BODY="${CHANGES_BODY/\"$CHANGES_OPERATION_ID\"/\"$REPLAY_OPERATION_ID\"}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$REPLAY_BODY"
expect_success "entry.request_changes replay"
expect_json "entry replay marker" replayed true
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$CHANGES_OPERATION_ID'::uuid and event_type='entry.changes_requested';")" == '1' ]] || fail "Entry replay duplicated its DomainEvent"

log "Accepting the same current revision emits the reviewed fact"
EXPECTED_VERSION="$(db_value "select version from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID';")"
REVIEW_BODY="{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Verified current revision\",\"p_operation_id\":\"$REVIEW_OPERATION_ID\",\"p_idempotency_key\":\"s5-entry-reviewed\",\"p_expected_version\":$EXPECTED_VERSION,\"p_expected_entry_version\":\"$ENTRY_VERSION\",\"p_correlation_id\":\"$CORRELATION_ID\"}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$REVIEW_BODY"
expect_success "entry.accept"
expect_json "entry accept command" command entry.accept
REVIEWED_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$REVIEW_OPERATION_ID'::uuid and event_type='entry.reviewed';")"
[[ -n "$REVIEWED_EVENT_ID" ]] || fail "entry.reviewed DomainEvent was not emitted"
claim_and_process 's5-entry-review-worker' "$REVIEWED_EVENT_ID"

log "Browser roles cannot execute Entry consequences"
rpc "$ORGANIZER_TOKEN" studio2_process_entry_domain_event "{\"p_event_id\":\"$REVIEWED_EVENT_ID\",\"p_consumer_key\":\"entry.tasks\",\"p_worker_id\":\"browser-worker\"}"
expect_failure "authenticated Entry consequence processing"

[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id in ('$CHANGES_OPERATION_ID'::uuid,'$REVIEW_OPERATION_ID'::uuid) and event_type in ('entry.changes_requested','entry.reviewed');")" == '2' ]] || fail "Entry S5 produced an unexpected number of facts for its operations"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id in ('$CHANGES_EVENT_ID'::uuid,'$REVIEWED_EVENT_ID'::uuid) and status='completed';")" == '2' ]] || fail "Entry consequence deliveries did not complete"

log "System V3 S5 Entry consequence rehearsal passed"
