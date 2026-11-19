#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[security-rehearsal] %s\n' "$*"; }
fail() { printf '\n[security-rehearsal] FAIL: %s\n' "$*" >&2; exit 1; }

# Supabase CLI exposes the local API, database and generated local keys in a
# shell-safe env format. The test never talks to production.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac


PASSWORD='RulesIntegrity2026!'
HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''
LAST_TOKEN=''
LAST_CASE_ID=''
LAST_CASE_CODE=''
LAST_RECOVERY_KEY=''
FUNCTION_PID=''

cleanup() {
  if [[ -n "${FUNCTION_PID:-}" ]] && kill -0 "$FUNCTION_PID" 2>/dev/null; then
    kill "$FUNCTION_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

json_value() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1].split(".") if sys.argv[1] else []
value = json.load(sys.stdin)
for key in path:
    if isinstance(value, list):
        value = value[int(key)]
    else:
        value = value[key]
if value is None:
    print("")
elif isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
' "$path"
}

request() {
  local method="$1"
  local url="$2"
  local bearer="$3"
  local api_key="$4"
  local data="${5-}"
  local content_type="${6-application/json}"
  local output
  output="$(mktemp)"
  local args=(
    -sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key"
    -H "Authorization: Bearer $bearer"
  )
  if [[ -n "$content_type" ]]; then
    args+=(-H "Content-Type: $content_type")
  fi
  if [[ -n "$data" ]]; then
    if [[ "$content_type" == "application/json" ]]; then
      args+=(--data "$data")
    else
      args+=(--data-binary "$data")
    fi
  fi
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
  log "PASS: $label"
}

expect_failure() {
  local label="$1"
  if (( HTTP_STATUS < 400 )); then
    fail "$label unexpectedly succeeded with HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
  log "PASS: $label rejected with HTTP $HTTP_STATUS"
}

expect_client_failure() {
  local label="$1"
  if (( HTTP_STATUS < 400 || HTTP_STATUS >= 500 )); then
    fail "$label expected an application-level 4xx rejection, got HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
  log "PASS: $label rejected with application HTTP $HTTP_STATUS"
}

expect_json_value() {
  local label="$1"
  local path="$2"
  local expected="$3"
  local actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got $actual from $HTTP_BODY"
  log "PASS: $label"
}

rpc_request() {
  local token="$1"
  local function_name="$2"
  local body="$3"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$token" "$ANON_KEY" "$body"
}

# The legacy endpoint must be absent at PostgREST resolution (PGRST202),
# rather than merely rejecting a fabricated fixture or an unauthorized write.
assert_retired_integrity_rpc_absent() {
  local bearer="$1" legacy_rpc="$2" payload="$3" role_label="$4"
  rpc_request "$bearer" "$legacy_rpc" "$payload"
  [[ "$HTTP_STATUS" == "404" ]] || fail "Retired RPC $legacy_rpc remained exposed to $role_label: HTTP $HTTP_STATUS $HTTP_BODY"
  expect_json_value "retired $legacy_rpc unavailable as $role_label" code PGRST202
}

function_request() {
  local token="$1"
  local function_name="$2"
  local body="$3"
  request POST "$API_URL/functions/v1/$function_name" "$token" "$ANON_KEY" "$body"
}

db_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null
}

db_scalar() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

integrity_case_version() {
  db_scalar "select version from public.integrity_cases where id='$1'::uuid;"
}

integrity_appeal_version() {
  db_scalar "select version from public.integrity_case_appeals where id='$1'::uuid;"
}

# Stable action identity for replay and idempotency verification.
prepare_integrity_operation() {
  local action="$1" scope="$2"
  read -r OPERATION_ID IDEMPOTENCY_KEY < <(python3 -c 'import hashlib,sys,uuid; seed="solaris:integrity-security-rehearsal:"+":".join(sys.argv[1:]); print(uuid.uuid5(uuid.NAMESPACE_URL,seed), hashlib.sha256(seed.encode()).hexdigest())' "$action" "$scope")
  [[ "$OPERATION_ID" =~ ^[[:xdigit:]-]{36}$ && "$IDEMPOTENCY_KEY" =~ ^[[:xdigit:]]{64}$ ]] || fail "Unable to create stable Integrity test operation identity"
}

integrity_test_payload() {
  python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p.update(p_operation_id=sys.argv[2],p_idempotency_key=sys.argv[3],p_expected_version=int(sys.argv[4])); print(json.dumps(p,separators=(",",":")))' "$1" "$2" "$3" "$4"
}

assert_db_eq() {
  local label="$1"
  local query="$2"
  local expected="$3"
  local actual
  actual="$(db_scalar "$query")"
  [[ "$actual" == "$expected" ]] || fail "$label expected '$expected', got '$actual'"
  log "PASS: $label"
}

create_user() {
  local email="$1"
  local body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  expect_success "create auth user $email"
  LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  [[ -n "$LAST_USER_ID" ]] || fail "Auth admin response for $email had no user id"
}

sign_in() {
  local email="$1"
  local body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$LAST_TOKEN" ]] || fail "Sign-in response for $email had no access token"
}

create_protected_case() {
  local token="$1"
  local identity_mode="$2"
  local case_kind="$3"
  local summary="$4"
  local body
  body="$(python3 -c '
import json,sys
print(json.dumps({
  "_identity_mode": sys.argv[1],
  "_case_kind": sys.argv[2],
  "_category": "conduct",
  "_summary": sys.argv[3],
  "_details": "Security rehearsal case details long enough for validation.",
  "_observed_facts": "A concrete test fact.",
  "_uncertainties": "Only the authorization boundary is under test.",
  "_related_countries": [],
  "_edition_reference": None,
}))
' "$identity_mode" "$case_kind" "$summary")"
  rpc_request "$token" create_protected_integrity_case "$body"
  expect_success "create $identity_mode $case_kind case"
  LAST_CASE_ID="$(printf '%s' "$HTTP_BODY" | json_value case_id)"
  LAST_CASE_CODE="$(printf '%s' "$HTTP_BODY" | json_value case_code)"
}

create_anonymous_case() {
  local token="$1"
  local summary="$2"
  local body
  body="$(python3 -c '
import json,sys
print(json.dumps({
  "_category": "conduct",
  "_summary": sys.argv[1],
  "_details": "Anonymous security rehearsal details long enough for validation.",
  "_observed_facts": "A concrete anonymous test fact.",
  "_uncertainties": "Authorization behavior only.",
  "_related_countries": [],
  "_edition_reference": None,
  "_case_kind": "report",
}))
' "$summary")"
  rpc_request "$token" public_create_anonymous_integrity_case "$body"
  expect_success "create anonymous case"
  LAST_CASE_CODE="$(printf '%s' "$HTTP_BODY" | json_value case_code)"
  LAST_RECOVERY_KEY="$(printf '%s' "$HTTP_BODY" | json_value recovery_key)"
  LAST_CASE_ID="$(db_scalar "select id from public.integrity_cases where public_code = '$LAST_CASE_CODE';")"
}

storage_upload() {
  local path="$1"
  local body="$2"
  request POST "$API_URL/storage/v1/object/integrity-evidence/$path" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body" "text/plain"
  expect_success "service-role seed private object $path"
  assert_db_eq "private object exists after service seed" "select count(*) from storage.objects where bucket_id='integrity-evidence' and name='$path';" "1"
}

log "Creating six hostile-test identities"
create_user reporter-a-security@solaris.invalid; REPORTER_A_ID="$LAST_USER_ID"
create_user reporter-b-security@solaris.invalid; REPORTER_B_ID="$LAST_USER_ID"
create_user organizer-a-security@solaris.invalid; ORGANIZER_A_ID="$LAST_USER_ID"
create_user organizer-b-security@solaris.invalid; ORGANIZER_B_ID="$LAST_USER_ID"
create_user participant-security@solaris.invalid; PARTICIPANT_ID="$LAST_USER_ID"

sign_in reporter-a-security@solaris.invalid; REPORTER_A_TOKEN="$LAST_TOKEN"
sign_in reporter-b-security@solaris.invalid; REPORTER_B_TOKEN="$LAST_TOKEN"
sign_in organizer-a-security@solaris.invalid; ORGANIZER_A_TOKEN="$LAST_TOKEN"
sign_in organizer-b-security@solaris.invalid; ORGANIZER_B_TOKEN="$LAST_TOKEN"
sign_in participant-security@solaris.invalid; PARTICIPANT_TOKEN="$LAST_TOKEN"

# Seed authoritative Organizer access through Permission Engine v2, then use
# only user-scoped JWTs for the hostile calls below.
db_exec "insert into public.studio2_role_assignments(user_id, role_key, edition_id, expires_at, assigned_by) values ('$ORGANIZER_A_ID'::uuid, 'organizer', null, null, null), ('$ORGANIZER_B_ID'::uuid, 'organizer', null, null, null) on conflict do nothing;"


log "PR450 canonical edition deletion boundary"
DELETE_EDITION_ID='00000000-0000-4000-8000-00000000f450'
db_exec "insert into public.editions(id,name,slug,edition_number,status,published) values ('$DELETE_EDITION_ID','Deletion security test','pr450-delete-security',450,'draft',false);"
rpc_request "$ANON_KEY" admin_confirmation_delete_edition "{\"_id\":\"$DELETE_EDITION_ID\"}"
expect_failure "anonymous callers cannot delete editions"
rpc_request "$PARTICIPANT_TOKEN" admin_confirmation_delete_edition "{\"_id\":\"$DELETE_EDITION_ID\"}"
expect_failure "ordinary participants cannot delete editions"
# Forge user-editable claims. The JWT is refreshed to include the forged data.
db_exec "update auth.users set raw_user_meta_data=jsonb_build_object('role','organizer','user_id','$ORGANIZER_A_ID') where id='$PARTICIPANT_ID'::uuid;"
sign_in participant-security@solaris.invalid; PARTICIPANT_TOKEN="$LAST_TOKEN"
rpc_request "$PARTICIPANT_TOKEN" admin_confirmation_delete_edition "{\"_id\":\"$DELETE_EDITION_ID\"}"
expect_failure "forged Organizer metadata cannot delete editions"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$PARTICIPANT_ID'::uuid,'delegation.manage','$DELETE_EDITION_ID'::uuid);"
rpc_request "$PARTICIPANT_TOKEN" admin_confirmation_delete_edition "{\"_id\":\"$DELETE_EDITION_ID\"}"
expect_failure "delegation management is not edition deletion permission"
assert_db_eq "denied calls preserve canonical edition" "select count(*) from public.editions where id='$DELETE_EDITION_ID';" "1"
rpc_request "$ORGANIZER_A_TOKEN" admin_confirmation_delete_edition "{\"_id\":\"$DELETE_EDITION_ID\"}"
expect_success "Organizer can delete the empty canonical edition"
assert_db_eq "authorized deletion removes only target edition" "select count(*) from public.editions where id='$DELETE_EDITION_ID';" "0"

log "PR450 durable signup limiter boundaries"
for attempt in $(seq 1 6); do
  request POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" '{"p_scope":"pr450-window","p_key_hash":"test-address","p_limit":5,"p_window_seconds":900}'
  expect_success "consume persistent attempt $attempt"
  if (( attempt <= 5 )); then expected=true; else expected=false; fi
  [[ "$HTTP_BODY" == "$expected" ]] || fail "Limiter attempt $attempt returned $HTTP_BODY"
done
request POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$ANON_KEY" "$ANON_KEY" '{"p_scope":"pr450-window","p_key_hash":"test-address","p_limit":1000,"p_window_seconds":900}'
expect_failure "anonymous caller cannot choose or reset protection budget"
assert_db_eq "different identities get independent budgets" "select public.country_auth_consume_rate_limit('pr450-window','other-address',5,900);" "t"
db_exec "update private.country_auth_rate_limits set window_started_at=now()-interval '16 minutes' where scope='pr450-window' and key_hash='test-address';"
assert_db_eq "expired window permits a new attempt" "select public.country_auth_consume_rate_limit('pr450-window','test-address',5,900);" "t"
# Separate psql sessions exercise the actual atomic conflict path concurrently.
rate_outputs="$(mktemp -d)"
rate_pids=()
for attempt in $(seq 1 12); do
  psql "$DB_URL" -XAt -v ON_ERROR_STOP=1 -c "select public.country_auth_consume_rate_limit('pr450-concurrent','same-address',5,900);" > "$rate_outputs/$attempt" &
  rate_pids+=("$!")
done
for rate_pid in "${rate_pids[@]}"; do wait "$rate_pid" || fail "Concurrent limiter query failed"; done
rate_allowed="$(python3 -c 'from pathlib import Path; import sys; print(sum(p.read_text().strip()=="t" for p in Path(sys.argv[1]).iterdir()))' "$rate_outputs")"
rm -rf "$rate_outputs"
[[ "$rate_allowed" == "5" ]] || fail "Concurrent limiter allowed $rate_allowed requests instead of 5"
assert_db_eq "atomic durable counter records all attempts" "select attempts from private.country_auth_rate_limits where scope='pr450-concurrent' and key_hash='same-address';" "12"

log "Organisation OS V5 R3 permission separation-of-duties tests"
R3_OPERATION_ID='00000000-0000-4000-8000-00000000f301'
R3_IDEMPOTENCY_KEY='security-rehearsal-r3-permission'

rpc_request "$ORGANIZER_A_TOKEN" studio2_permission_change_preview "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"broadcast.control\",\"p_edition_id\":null,\"p_expires_at\":null}"
expect_success "preview R3 permission grant"
R3_EXPECTED_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
[[ -n "$R3_EXPECTED_VERSION" ]] || fail "R3 preview returned no expectedVersion"

rpc_request "$ORGANIZER_A_TOKEN" studio2_request_permission_change_approval "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"broadcast.control\",\"p_edition_id\":null,\"p_expires_at\":null,\"p_operation_id\":\"$R3_OPERATION_ID\",\"p_idempotency_key\":\"$R3_IDEMPOTENCY_KEY\",\"p_expected_version\":$R3_EXPECTED_VERSION}"
expect_success "request R3 second-operator approval"
R3_APPROVAL_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
[[ -n "$R3_APPROVAL_ID" ]] || fail "R3 approval request returned no id"

rpc_request "$ORGANIZER_A_TOKEN" studio2_approve_permission_change "{\"p_request_id\":\"$R3_APPROVAL_ID\"}"
expect_failure "R3 requester cannot self-approve"
assert_db_eq "R3 self-approval leaves request pending" "select approved_at is null from public.studio2_permission_change_approval_requests where id='$R3_APPROVAL_ID'::uuid;" "t"

rpc_request "$ORGANIZER_B_TOKEN" studio2_approve_permission_change "{\"p_request_id\":\"$R3_APPROVAL_ID\"}"
expect_success "different Organizer approves R3 permission change"
assert_db_eq "R3 approval records independent approver" "select approved_by::text from public.studio2_permission_change_approval_requests where id='$R3_APPROVAL_ID'::uuid;" "$ORGANIZER_B_ID"

rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_permission_change_r3 "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"broadcast.control\",\"p_edition_id\":null,\"p_expires_at\":null,\"p_operation_id\":\"$R3_OPERATION_ID\",\"p_idempotency_key\":\"$R3_IDEMPOTENCY_KEY\",\"p_expected_version\":$R3_EXPECTED_VERSION,\"p_approval_request_id\":\"$R3_APPROVAL_ID\"}"
expect_success "requester applies independently approved R3 permission change"
assert_db_eq "R3 permission grant exists exactly once" "select count(*) from public.studio2_capability_grants where user_id='$PARTICIPANT_ID'::uuid and capability='broadcast.control' and edition_id is null;" "1"
assert_db_eq "R3 approval is consumed after apply" "select consumed_at is not null from public.studio2_permission_change_approval_requests where id='$R3_APPROVAL_ID'::uuid;" "t"

rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_permission_change_r3 "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"broadcast.control\",\"p_edition_id\":null,\"p_expires_at\":null,\"p_operation_id\":\"$R3_OPERATION_ID\",\"p_idempotency_key\":\"$R3_IDEMPOTENCY_KEY\",\"p_expected_version\":$R3_EXPECTED_VERSION,\"p_approval_request_id\":\"$R3_APPROVAL_ID\"}"
expect_success "R3 retry replays the canonical receipt"
assert_db_eq "R3 replay does not duplicate permission grant" "select count(*) from public.studio2_capability_grants where user_id='$PARTICIPANT_ID'::uuid and capability='broadcast.control' and edition_id is null;" "1"

R3_STALE_OPERATION_ID='00000000-0000-4000-8000-00000000f302'
R3_STALE_IDEMPOTENCY_KEY='security-rehearsal-r3-stale'
rpc_request "$ORGANIZER_A_TOKEN" studio2_permission_change_preview "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"host.manage\",\"p_edition_id\":null,\"p_expires_at\":null}"
expect_success "preview R3 permission grant for stale-version test"
R3_STALE_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
rpc_request "$ORGANIZER_A_TOKEN" studio2_request_permission_change_approval "{\"p_user_id\":\"$PARTICIPANT_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"host.manage\",\"p_edition_id\":null,\"p_expires_at\":null,\"p_operation_id\":\"$R3_STALE_OPERATION_ID\",\"p_idempotency_key\":\"$R3_STALE_IDEMPOTENCY_KEY\",\"p_expected_version\":$R3_STALE_VERSION}"
expect_success "request R3 approval before concurrent permission change"
R3_STALE_APPROVAL_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"

db_exec "update public.studio2_permission_subject_versions set version=version+1, updated_at=now() where user_id='$PARTICIPANT_ID'::uuid;"
rpc_request "$ORGANIZER_B_TOKEN" studio2_approve_permission_change "{\"p_request_id\":\"$R3_STALE_APPROVAL_ID\"}"
expect_failure "R3 approval rejects stale access version"
assert_db_eq "stale R3 approval remains unapproved" "select approved_at is null from public.studio2_permission_change_approval_requests where id='$R3_STALE_APPROVAL_ID'::uuid;" "t"

log "Case privacy and anonymous-mode abuse tests"
create_protected_case "$REPORTER_A_TOKEN" confidential report "Reporter A private case"; CASE_A="$LAST_CASE_ID"
create_protected_case "$REPORTER_B_TOKEN" confidential report "Reporter B private case"; CASE_B="$LAST_CASE_ID"

rpc_request "$REPORTER_A_TOKEN" reporter_integrity_case "{\"_case_id\":\"$CASE_B\"}"
expect_failure "Reporter A cannot read Reporter B case"

request GET "$API_URL/rest/v1/integrity_cases?select=id&limit=1" "$ORGANIZER_A_TOKEN" "$ANON_KEY" ""
expect_failure "Organizer browser cannot SELECT the protected integrity_cases table directly"
request GET "$API_URL/rest/v1/integrity_case_evidence?select=id&limit=1" "$REPORTER_A_TOKEN" "$ANON_KEY" ""
expect_failure "Reporter browser cannot SELECT protected evidence rows directly"

create_anonymous_case "$ANON_KEY" "Anonymous case one"; ANON_CASE_1="$LAST_CASE_ID"; ANON_CODE_1="$LAST_CASE_CODE"; ANON_KEY_1="$LAST_RECOVERY_KEY"
create_anonymous_case "$ANON_KEY" "Anonymous case two"; ANON_CASE_2="$LAST_CASE_ID"; ANON_CODE_2="$LAST_CASE_CODE"; ANON_KEY_2="$LAST_RECOVERY_KEY"
assert_db_eq "fully anonymous case has no reporter_user_id" "select reporter_user_id is null from public.integrity_cases where id='$ANON_CASE_1'::uuid;" "t"

rpc_request "$ANON_KEY" public_get_anonymous_integrity_case "{\"_case_code\":\"$ANON_CODE_1\",\"_recovery_key\":\"$ANON_KEY_2\"}"
expect_success "wrong anonymous recovery pair returns a safe response"
expect_json_value "wrong anonymous recovery pair is denied" ok false

create_anonymous_case "$REPORTER_A_TOKEN" "Anonymous call while signed in"; ANON_SIGNED_IN="$LAST_CASE_ID"
assert_db_eq "session identity never leaks into fully anonymous creation" "select reporter_user_id is null from public.integrity_cases where id='$ANON_SIGNED_IN'::uuid;" "t"

# The two reporter reply primitives now live solely inside their versioned
# command owners. Exercise actual JWT/Data API positives, replay, stale/CAS
# conflicts, wrong-reporter denial and anonymous recovery-token isolation.
prepare_integrity_operation "P04-signed-reporter-reply" "$CASE_A"
REPLY_OLD_VERSION="$(integrity_case_version "$CASE_A")"
# Intake writes its own first reporter message. Test the reply as +1,
# preserving exact replay/denial counts instead of assuming an empty case.
REPLY_BASE_MESSAGES="$(db_scalar "select count(*) from public.integrity_case_messages where case_id='$CASE_A'::uuid and author_role='reporter';")"
REGISTERED_REPLY_PAYLOAD="{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_id\":\"$CASE_A\",\"p_body\":\"P04 registered reporter revisioned response.\",\"p_expected_version\":$REPLY_OLD_VERSION}"
rpc_request "$REPORTER_A_TOKEN" v3_reporter_reply_integrity_case "$REGISTERED_REPLY_PAYLOAD"
expect_success "registered reporter replies through one canonical writer"
REPLY_NEW_VERSION="$(integrity_case_version "$CASE_A")"
(( REPLY_NEW_VERSION > REPLY_OLD_VERSION )) || fail "Registered reporter response did not advance case revision"
assert_db_eq "registered reply has one immutable CAS history revision" "select count(*) from public.integrity_adjudication_history where aggregate_type='case' and aggregate_id='$CASE_A'::uuid and event_type='integrity.case_changed' and revision=$REPLY_NEW_VERSION and operation_id='$OPERATION_ID'::uuid;" "1"
assert_db_eq "registered reply emits version-matched canonical event" "select count(*) from public.integrity_case_events where case_id='$CASE_A'::uuid and event_type='integrity.case_changed' and aggregate_version=$REPLY_NEW_VERSION and operation_id='$OPERATION_ID'::uuid;" "1"
assert_db_eq "one registered reporter message persisted" "select count(*) from public.integrity_case_messages where case_id='$CASE_A'::uuid and author_role='reporter';" "$((REPLY_BASE_MESSAGES + 1))"
rpc_request "$REPORTER_A_TOKEN" v3_reporter_reply_integrity_case "$REGISTERED_REPLY_PAYLOAD"
expect_success "registered reporter idempotency replay"
assert_db_eq "registered reply replay did not duplicate a message" "select count(*) from public.integrity_case_messages where case_id='$CASE_A'::uuid and author_role='reporter';" "$((REPLY_BASE_MESSAGES + 1))"
prepare_integrity_operation "P04-wrong-reporter-reply" "$CASE_A"
rpc_request "$REPORTER_B_TOKEN" v3_reporter_reply_integrity_case "{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_id\":\"$CASE_A\",\"p_body\":\"Other reporter must be denied.\",\"p_expected_version\":$REPLY_NEW_VERSION}"
expect_client_failure "cross-reporter reply denied at canonical owner"
assert_db_eq "wrong reporter created no messages" "select count(*) from public.integrity_case_messages where case_id='$CASE_A'::uuid and author_role='reporter';" "$((REPLY_BASE_MESSAGES + 1))"
prepare_integrity_operation "P04-registered-stale-reply" "$CASE_A"
rpc_request "$REPORTER_A_TOKEN" v3_reporter_reply_integrity_case "{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_id\":\"$CASE_A\",\"p_body\":\"Outdated case revision must fail.\",\"p_expected_version\":$REPLY_OLD_VERSION}"
expect_client_failure "registered reporter stale expected revision denied"
expect_json_value "registered reporter CAS SQLSTATE" code PT409

prepare_integrity_operation "P04-anonymous-reporter-reply" "$ANON_CASE_1"
ANON_REPLY_OLD_VERSION="$(integrity_case_version "$ANON_CASE_1")"
ANON_REPLY_BASE_MESSAGES="$(db_scalar "select count(*) from public.integrity_case_messages where case_id='$ANON_CASE_1'::uuid and author_role='reporter';")"
ANON_REPLY_PAYLOAD="{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_code\":\"$ANON_CODE_1\",\"p_recovery_key\":\"$ANON_KEY_1\",\"p_body\":\"P04 anonymous reporter revisioned response.\",\"p_expected_version\":$ANON_REPLY_OLD_VERSION}"
rpc_request "$ANON_KEY" v3_public_reply_anonymous_integrity_case "$ANON_REPLY_PAYLOAD"
expect_success "anonymous reporter replies through recovery-key scoped canonical writer"
ANON_REPLY_NEW_VERSION="$(integrity_case_version "$ANON_CASE_1")"
(( ANON_REPLY_NEW_VERSION > ANON_REPLY_OLD_VERSION )) || fail "Anonymous reporter response did not advance case revision"
assert_db_eq "anonymous reply has one immutable CAS history revision" "select count(*) from public.integrity_adjudication_history where aggregate_type='case' and aggregate_id='$ANON_CASE_1'::uuid and event_type='integrity.case_changed' and revision=$ANON_REPLY_NEW_VERSION and operation_id='$OPERATION_ID'::uuid;" "1"
assert_db_eq "anonymous reply emits version-matched canonical event" "select count(*) from public.integrity_case_events where case_id='$ANON_CASE_1'::uuid and event_type='integrity.case_changed' and aggregate_version=$ANON_REPLY_NEW_VERSION and operation_id='$OPERATION_ID'::uuid;" "1"
assert_db_eq "one anonymous reporter message persisted" "select count(*) from public.integrity_case_messages where case_id='$ANON_CASE_1'::uuid and author_role='reporter';" "$((ANON_REPLY_BASE_MESSAGES + 1))"
rpc_request "$ANON_KEY" v3_public_reply_anonymous_integrity_case "$ANON_REPLY_PAYLOAD"
expect_success "anonymous reply idempotency replay"
assert_db_eq "anonymous replay did not duplicate a message" "select count(*) from public.integrity_case_messages where case_id='$ANON_CASE_1'::uuid and author_role='reporter';" "$((ANON_REPLY_BASE_MESSAGES + 1))"
# Completed replay is NEVER an authorization bypass for the secret recovery key.
REPLAY_WRONG_SECRET="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p["p_recovery_key"]=sys.argv[2]; print(json.dumps(p,separators=(",",":")))' "$ANON_REPLY_PAYLOAD" "$ANON_KEY_2")"
rpc_request "$ANON_KEY" v3_public_reply_anonymous_integrity_case "$REPLAY_WRONG_SECRET"
expect_client_failure "completed anonymous idempotent replay rejects mismatched recovery secret"
assert_db_eq "wrong replay secret cannot insert an anonymous message" "select count(*) from public.integrity_case_messages where case_id='$ANON_CASE_1'::uuid and author_role='reporter';" "$((ANON_REPLY_BASE_MESSAGES + 1))"
prepare_integrity_operation "P04-wrong-anonymous-key" "$ANON_CASE_1"
rpc_request "$ANON_KEY" v3_public_reply_anonymous_integrity_case "{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_code\":\"$ANON_CODE_1\",\"p_recovery_key\":\"$ANON_KEY_2\",\"p_body\":\"Wrong key must never expose the case.\",\"p_expected_version\":$ANON_REPLY_NEW_VERSION}"
expect_client_failure "wrong anonymous recovery key rejected"
assert_db_eq "wrong recovery key created no messages" "select count(*) from public.integrity_case_messages where case_id='$ANON_CASE_1'::uuid and author_role='reporter';" "$((ANON_REPLY_BASE_MESSAGES + 1))"


log "Sealed-identity break-glass abuse tests"
create_protected_case "$REPORTER_A_TOKEN" sealed report "Sealed identity security case"; SEALED_CASE="$LAST_CASE_ID"

rpc_request "$ORGANIZER_A_TOKEN" admin_integrity_reporter_identity "{\"_case_id\":\"$SEALED_CASE\"}"
expect_failure "ordinary organizer identity RPC cannot reveal a sealed reporter"
assert_db_eq "failed sealed reveal creates no identity.accessed event" "select count(*) from public.integrity_case_events where case_id='$SEALED_CASE'::uuid and event_type='identity.accessed';" "0"

rpc_request "$ORGANIZER_A_TOKEN" admin_request_sealed_identity_disclosure "{\"_case_id\":\"$SEALED_CASE\",\"_reason\":\"Exceptional security rehearsal reason requiring identity access.\"}"
expect_success "organizer A creates sealed disclosure request"
SEALED_REQUEST="$(printf '%s' "$HTTP_BODY" | json_value request_id)"

rpc_request "$ORGANIZER_A_TOKEN" admin_decide_sealed_identity_disclosure "{\"_request_id\":\"$SEALED_REQUEST\",\"_approve\":true,\"_reason\":\"Self approval must be rejected by the database boundary.\"}"
expect_failure "requester cannot approve their own sealed disclosure"
assert_db_eq "self-approval failure leaves request pending" "select status from public.integrity_identity_disclosure_requests where id='$SEALED_REQUEST'::uuid;" "pending"

rpc_request "$ORGANIZER_B_TOKEN" admin_decide_sealed_identity_disclosure "{\"_request_id\":\"$SEALED_REQUEST\",\"_approve\":true,\"_reason\":\"Independent second organizer approves this controlled rehearsal.\"}"
expect_success "different organizer approves sealed disclosure"

rpc_request "$ORGANIZER_B_TOKEN" admin_reveal_sealed_identity "{\"_request_id\":\"$SEALED_REQUEST\"}"
expect_failure "non-requesting organizer cannot consume approved disclosure"
assert_db_eq "failed non-requester reveal leaves approval intact" "select status from public.integrity_identity_disclosure_requests where id='$SEALED_REQUEST'::uuid;" "approved"

rpc_request "$ORGANIZER_A_TOKEN" admin_reveal_sealed_identity "{\"_request_id\":\"$SEALED_REQUEST\"}"
expect_success "requesting organizer consumes one-time approved disclosure"
expect_json_value "sealed reveal returns the correct reporter" user_id "$REPORTER_A_ID"
assert_db_eq "sealed disclosure is marked used" "select status from public.integrity_identity_disclosure_requests where id='$SEALED_REQUEST'::uuid;" "used"
assert_db_eq "sealed disclosure creates reporter-visible audit event" "select count(*) from public.integrity_case_events where case_id='$SEALED_CASE'::uuid and event_type='identity.sealed_disclosed' and visible_to_reporter=true;" "1"

rpc_request "$ORGANIZER_A_TOKEN" admin_reveal_sealed_identity "{\"_request_id\":\"$SEALED_REQUEST\"}"
expect_failure "one-time sealed disclosure cannot be used twice"
assert_db_eq "second reveal failure does not reopen the disclosure" "select status from public.integrity_identity_disclosure_requests where id='$SEALED_REQUEST'::uuid;" "used"

create_protected_case "$REPORTER_B_TOKEN" sealed report "Expiring sealed identity case"; EXPIRED_SEALED_CASE="$LAST_CASE_ID"
rpc_request "$ORGANIZER_A_TOKEN" admin_request_sealed_identity_disclosure "{\"_case_id\":\"$EXPIRED_SEALED_CASE\",\"_reason\":\"Security rehearsal creates an approval that will be forced stale.\"}"
expect_success "create disclosure request for expiry test"; EXPIRED_REQUEST="$(printf '%s' "$HTTP_BODY" | json_value request_id)"
rpc_request "$ORGANIZER_B_TOKEN" admin_decide_sealed_identity_disclosure "{\"_request_id\":\"$EXPIRED_REQUEST\",\"_approve\":true,\"_reason\":\"Independent approval used only to test expiry enforcement.\"}"
expect_success "approve disclosure for expiry test"
db_exec "update public.integrity_identity_disclosure_requests set approval_expires_at=now()-interval '1 minute' where id='$EXPIRED_REQUEST'::uuid;"
rpc_request "$ORGANIZER_A_TOKEN" admin_reveal_sealed_identity "{\"_request_id\":\"$EXPIRED_REQUEST\"}"
expect_failure "expired sealed disclosure cannot reveal identity"
assert_db_eq "expired reveal failure does not mark disclosure used" "select disclosed_at is null from public.integrity_identity_disclosure_requests where id='$EXPIRED_REQUEST'::uuid;" "t"
rpc_request "$ORGANIZER_B_TOKEN" admin_identity_disclosure_requests '{}'
expect_success "identity queue persists stale approval expiry"
assert_db_eq "stale approval is persisted as expired" "select status from public.integrity_identity_disclosure_requests where id='$EXPIRED_REQUEST'::uuid;" "expired"

log "Evidence RLS, signed-read and lifecycle boundary tests"
VISIBLE_PATH="case/$CASE_A/reporter/security-visible.txt"
INTERNAL_PATH="case/$CASE_A/reporter/security-internal.txt"
DUE_PATH="case/$CASE_A/reporter/security-due.txt"
ORPHAN_PATH="case/$CASE_A/reporter/security-orphan.txt"
storage_upload "$VISIBLE_PATH" 'visible evidence body'
storage_upload "$INTERNAL_PATH" 'internal evidence body'
storage_upload "$DUE_PATH" 'due evidence body'
storage_upload "$ORPHAN_PATH" 'unfinished upload body'

VISIBLE_EVIDENCE="$(db_scalar "insert into public.integrity_case_evidence(case_id,source_role,evidence_type,title,storage_path,original_name,mime_type,size_bytes,provenance,visible_to_reporter,created_by) values ('$CASE_A'::uuid,'reporter','file','Visible rehearsal evidence','$VISIBLE_PATH','security-visible.txt','text/plain',21,'Security rehearsal visible file',true,'$REPORTER_A_ID'::uuid) returning id;")"
INTERNAL_EVIDENCE="$(db_scalar "insert into public.integrity_case_evidence(case_id,source_role,evidence_type,title,storage_path,original_name,mime_type,size_bytes,provenance,visible_to_reporter,created_by) values ('$CASE_A'::uuid,'reporter','file','Internal rehearsal evidence','$INTERNAL_PATH','security-internal.txt','text/plain',22,'Security rehearsal internal file',false,'$REPORTER_A_ID'::uuid) returning id;")"
DUE_EVIDENCE="$(db_scalar "insert into public.integrity_case_evidence(case_id,source_role,evidence_type,title,storage_path,original_name,mime_type,size_bytes,provenance,visible_to_reporter,created_by) values ('$CASE_A'::uuid,'reporter','file','Lifecycle rehearsal evidence','$DUE_PATH','security-due.txt','text/plain',17,'Security rehearsal lifecycle file',true,'$REPORTER_A_ID'::uuid) returning id;")"

ACCESS_BEFORE="$(db_scalar "select count(*) from public.integrity_evidence_access_log where case_id='$CASE_A'::uuid;")"
rpc_request "$REPORTER_A_TOKEN" reporter_integrity_evidence_access_descriptor "{\"_case_id\":\"$CASE_A\",\"_evidence_id\":\"$INTERNAL_EVIDENCE\",\"_action\":\"download_requested\"}"
expect_failure "reporter cannot access organizer-private evidence"
assert_db_eq "failed private-evidence access leaves audit-log state unchanged" "select count(*) from public.integrity_evidence_access_log where case_id='$CASE_A'::uuid;" "$ACCESS_BEFORE"

request GET "$API_URL/storage/v1/object/authenticated/integrity-evidence/$VISIBLE_PATH" "$REPORTER_A_TOKEN" "$ANON_KEY" ""
expect_failure "reporter browser cannot directly SELECT a private evidence object"
request GET "$API_URL/storage/v1/object/authenticated/integrity-evidence/$VISIBLE_PATH" "$ORGANIZER_A_TOKEN" "$ANON_KEY" ""
expect_failure "organizer browser cannot directly SELECT a private evidence object"
request DELETE "$API_URL/storage/v1/object/integrity-evidence/$VISIBLE_PATH" "$ORGANIZER_A_TOKEN" "$ANON_KEY" ""
expect_failure "organizer browser cannot directly DELETE a private evidence object"
assert_db_eq "failed browser delete leaves private object intact" "select count(*) from storage.objects where bucket_id='integrity-evidence' and name='$VISIBLE_PATH';" "1"

TOKENS_BEFORE="$(db_scalar "select count(*) from public.integrity_evidence_upload_tokens where case_id='$CASE_A'::uuid;")"
rpc_request "$REPORTER_A_TOKEN" create_protected_evidence_upload "{\"_case_id\":\"$CASE_A\",\"_name\":\"malware.zip\",\"_mime\":\"application/zip\",\"_size\":1024}"
expect_failure "unsupported evidence MIME type is rejected"
rpc_request "$REPORTER_A_TOKEN" create_protected_evidence_upload "{\"_case_id\":\"$CASE_A\",\"_name\":\"too-large.pdf\",\"_mime\":\"application/pdf\",\"_size\":15728641}"
expect_failure "evidence larger than 15 MB is rejected"
assert_db_eq "invalid evidence uploads create no upload token" "select count(*) from public.integrity_evidence_upload_tokens where case_id='$CASE_A'::uuid;" "$TOKENS_BEFORE"

# Serve the repository's actual Edge Functions. --no-verify-jwt disables the
# gateway precheck only; both functions still validate the caller token with
# auth.getUser and authorize through caller-scoped RPCs.
supabase functions serve --no-verify-jwt >/tmp/rules-integrity-functions.log 2>&1 &
FUNCTION_PID=$!
FUNCTION_READY=0
for _ in $(seq 1 120); do
  request POST "$API_URL/functions/v1/integrity-evidence-download" "$ANON_KEY" "$ANON_KEY" '{}'
  if [[ "$HTTP_STATUS" != "000" && "$HTTP_STATUS" != 5* ]]; then
    FUNCTION_READY=1
    break
  fi
  sleep 1
done
if [[ "$FUNCTION_READY" != "1" ]]; then
  tail -n 200 /tmp/rules-integrity-functions.log >&2 || true
  fail "Local Evidence Edge Functions did not become application-ready"
fi

function_request "$REPORTER_A_TOKEN" integrity-evidence-download "{\"mode\":\"reporter\",\"caseId\":\"$CASE_B\",\"evidenceId\":\"$VISIBLE_EVIDENCE\"}"
expect_client_failure "signed evidence download rejects a mismatched reporter case"
function_request "$PARTICIPANT_TOKEN" integrity-evidence-download "{\"mode\":\"organizer\",\"evidenceId\":\"$VISIBLE_EVIDENCE\"}"
expect_client_failure "ordinary participant cannot use organizer signed-download mode"
function_request "$REPORTER_A_TOKEN" integrity-evidence-download "{\"mode\":\"reporter\",\"caseId\":\"$CASE_A\",\"evidenceId\":\"$VISIBLE_EVIDENCE\"}"
expect_success "owner receives a server-authorized signed evidence URL"
expect_json_value "signed evidence URL has the fixed one-minute TTL" expiresInSeconds 60
SIGNED_URL="$(printf '%s' "$HTTP_BODY" | json_value url)"
# Storage signs local URLs against Kong's container hostname. The rehearsal
# runs curl on the host, where that name is not resolvable; route the same
# signed path through the CLI's published API endpoint.
SIGNED_URL="${SIGNED_URL/http:\/\/kong:8000/$API_URL}"
SIGNED_STATUS="$(curl -sS -o /tmp/security-signed-evidence.txt -w '%{http_code}' "$SIGNED_URL")"
[[ "$SIGNED_STATUS" == "200" ]] || fail "Signed evidence URL did not download the seeded object: HTTP $SIGNED_STATUS"
[[ "$(cat /tmp/security-signed-evidence.txt)" == 'visible evidence body' ]] || fail "Signed evidence URL returned the wrong object body"
log "PASS: signed evidence URL reads the authorized private object"

FUTURE_DELETE="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(minutes=10)).isoformat())')"
rpc_request "$ORGANIZER_A_TOKEN" admin_schedule_integrity_evidence_deletion "{\"_evidence_id\":\"$DUE_EVIDENCE\",\"_delete_after\":\"$FUTURE_DELETE\",\"_reason\":\"Security rehearsal future deletion boundary.\"}"
expect_success "organizer schedules future evidence deletion"
function_request "$ORGANIZER_A_TOKEN" integrity-evidence-lifecycle "{\"mode\":\"delete_evidence\",\"evidenceId\":\"$DUE_EVIDENCE\"}"
expect_client_failure "server lifecycle refuses deletion before retention expires"
assert_db_eq "early lifecycle attempt leaves evidence scheduled" "select lifecycle_status from public.integrity_case_evidence where id='$DUE_EVIDENCE'::uuid;" "scheduled_for_deletion"
assert_db_eq "early lifecycle attempt leaves object intact" "select count(*) from storage.objects where bucket_id='integrity-evidence' and name='$DUE_PATH';" "1"

db_exec "update public.integrity_case_evidence set retention_until=now()-interval '1 minute' where id='$DUE_EVIDENCE'::uuid;"
function_request "$PARTICIPANT_TOKEN" integrity-evidence-lifecycle "{\"mode\":\"delete_evidence\",\"evidenceId\":\"$DUE_EVIDENCE\"}"
expect_client_failure "ordinary participant cannot run evidence lifecycle deletion"
function_request "$ORGANIZER_A_TOKEN" integrity-evidence-lifecycle "{\"mode\":\"delete_evidence\",\"evidenceId\":\"$DUE_EVIDENCE\"}"
expect_success "authorized server lifecycle deletes due evidence"
expect_json_value "due lifecycle response succeeds" ok true
assert_db_eq "due evidence row is finalized deleted" "select lifecycle_status from public.integrity_case_evidence where id='$DUE_EVIDENCE'::uuid;" "deleted"
assert_db_eq "due evidence private object is removed" "select count(*) from storage.objects where bucket_id='integrity-evidence' and name='$DUE_PATH';" "0"

ORPHAN_TOKEN="$(db_scalar "insert into public.integrity_evidence_upload_tokens(case_id,object_path,original_name,mime_type,expected_size,created_by,expires_at) values ('$CASE_A'::uuid,'$ORPHAN_PATH','security-orphan.txt','text/plain',22,'$REPORTER_A_ID'::uuid,now()+interval '10 minutes') returning id;")"
function_request "$ORGANIZER_A_TOKEN" integrity-evidence-lifecycle "{\"mode\":\"clean_expired_upload\",\"tokenId\":\"$ORPHAN_TOKEN\"}"
expect_client_failure "unfinished upload cannot be cleaned before token expiry"
assert_db_eq "early orphan cleanup leaves upload token" "select count(*) from public.integrity_evidence_upload_tokens where id='$ORPHAN_TOKEN'::uuid;" "1"
db_exec "update public.integrity_evidence_upload_tokens set expires_at=now()-interval '1 minute' where id='$ORPHAN_TOKEN'::uuid;"
function_request "$ORGANIZER_A_TOKEN" integrity-evidence-lifecycle "{\"mode\":\"clean_expired_upload\",\"tokenId\":\"$ORPHAN_TOKEN\"}"
expect_success "authorized lifecycle cleans an expired unfinished upload"
assert_db_eq "expired orphan token is removed" "select count(*) from public.integrity_evidence_upload_tokens where id='$ORPHAN_TOKEN'::uuid;" "0"
assert_db_eq "expired orphan object is removed" "select count(*) from storage.objects where bucket_id='integrity-evidence' and name='$ORPHAN_PATH';" "0"

log "Appeal conflict, duplicate and proportionality abuse tests"
create_protected_case "$REPORTER_A_TOKEN" confidential report "Appeal security case"; APPEAL_CASE="$LAST_CASE_ID"
prepare_integrity_operation "appeal-case-finding" "$APPEAL_CASE"
CASE_VERSION="$(integrity_case_version "$APPEAL_CASE")"
FINDING_REVIEWED_VERSION="$CASE_VERSION"
APPEAL_FINDING_PAYLOAD="{\"p_case_id\":\"$APPEAL_CASE\",\"p_outcome\":\"violation\",\"p_summary\":\"Confirmed rehearsal violation\",\"p_rationale\":\"The controlled rehearsal establishes a violation for appeal-boundary testing only.\",\"p_rule_ids\":[\"11.2\"],\"p_visible_to_reporter\":true,\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$CASE_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "$APPEAL_FINDING_PAYLOAD"
expect_success "organizer records appeal-test finding"; FINDING_ID="$(printf '%s' "$HTTP_BODY" | json_value finding_id)"
[[ -n "$FINDING_ID" ]] || fail "Canonical finding has no finding_id"
assert_db_eq "canonical finding ID exists" "select count(*) from public.integrity_case_findings where id='$FINDING_ID'::uuid and case_id='$APPEAL_CASE'::uuid;" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "$APPEAL_FINDING_PAYLOAD"
expect_success "identical finding operation safely replays"
expect_json_value "replay returns same finding id" finding_id "$FINDING_ID"
CONFLICT_FINDING_PAYLOAD="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p["p_summary"]="Different replay payload"; print(json.dumps(p,separators=(",",":")))' "$APPEAL_FINDING_PAYLOAD")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "$CONFLICT_FINDING_PAYLOAD"
expect_client_failure "same finding operation with conflicting payload is rejected"
assert_db_eq "finding replay and conflict have no duplicate effect" "select count(*) from public.integrity_case_findings where case_id='$APPEAL_CASE'::uuid;" "1"
FINDING_VERSION_AFTER="$(integrity_case_version "$APPEAL_CASE")"
(( FINDING_VERSION_AFTER > FINDING_REVIEWED_VERSION )) || fail "Canonical finding did not advance the reviewed case version"
prepare_integrity_operation "stale-case-finding" "$APPEAL_CASE"
STALE_FINDING_PAYLOAD="$(integrity_test_payload "$APPEAL_FINDING_PAYLOAD" "$OPERATION_ID" "$IDEMPOTENCY_KEY" "$FINDING_REVIEWED_VERSION")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "$STALE_FINDING_PAYLOAD"
expect_client_failure "stale reviewed case version is rejected"
expect_json_value "stale case conflict SQLSTATE" code PT409
MISSING_FINDING_OPERATION_PAYLOAD="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p["p_operation_id"]=None; print(json.dumps(p,separators=(",",":")))' "$APPEAL_FINDING_PAYLOAD")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "$MISSING_FINDING_OPERATION_PAYLOAD"
expect_client_failure "missing operation ID is rejected"
expect_json_value "missing operation ID SQLSTATE" code 22023
rpc_request "$PARTICIPANT_TOKEN" studio2_integrity_record_finding "$APPEAL_FINDING_PAYLOAD"
expect_client_failure "unauthorized participant cannot invoke finding command"
assert_db_eq "negative finding tests leave only one finding" "select count(*) from public.integrity_case_findings where case_id='$APPEAL_CASE'::uuid;" "1"
prepare_integrity_operation "appeal-case-sanction" "$APPEAL_CASE"
CASE_VERSION="$(integrity_case_version "$APPEAL_CASE")"
APPEAL_SANCTION_PAYLOAD="{\"p_case_id\":\"$APPEAL_CASE\",\"p_finding_id\":\"$FINDING_ID\",\"p_typical_level\":5,\"p_final_level\":5,\"p_target_type\":\"participant\",\"p_target_reference\":\"security-rehearsal\",\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_rationale\":\"Controlled Level 5 sanction used to prove appeal authorization boundaries.\",\"p_visible_to_reporter\":true,\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$CASE_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_sanction "$APPEAL_SANCTION_PAYLOAD"
expect_success "organizer records appeal-test sanction"; SANCTION_ID="$(printf '%s' "$HTTP_BODY" | json_value sanction_id)"
[[ -n "$SANCTION_ID" ]] || fail "Canonical sanction has no sanction_id"
assert_db_eq "canonical sanction ID exists" "select count(*) from public.integrity_case_sanctions where id='$SANCTION_ID'::uuid and finding_id='$FINDING_ID'::uuid;" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_sanction "$APPEAL_SANCTION_PAYLOAD"
expect_success "identical sanction operation safely replays"
expect_json_value "replay returns same sanction id" sanction_id "$SANCTION_ID"
assert_db_eq "sanction replay has no duplicate effect" "select count(*) from public.integrity_case_sanctions where case_id='$APPEAL_CASE'::uuid;" "1"
prepare_integrity_operation "participant-first-appeal" "$APPEAL_CASE"
APPEAL_SUBMIT_PAYLOAD="{\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_case_id\":\"$APPEAL_CASE\",\"p_sanction_id\":\"$SANCTION_ID\",\"p_grounds\":\"The controlled rehearsal submits a valid appeal to exercise fresh-review rules.\"}"
rpc_request "$REPORTER_A_TOKEN" v3_submit_integrity_appeal "$APPEAL_SUBMIT_PAYLOAD"
expect_success "governed reporter submits first appeal"; APPEAL_ID="$(printf '%s' "$HTTP_BODY" | json_value appeal_id)"
[[ -n "$APPEAL_ID" ]] || fail "Canonical participant appeal did not return an appeal ID"
rpc_request "$REPORTER_A_TOKEN" v3_submit_integrity_appeal "$APPEAL_SUBMIT_PAYLOAD"
expect_success "governed participant appeal safely replays"
expect_json_value "governed participant appeal replay is flagged" replayed true
assert_db_eq "replayed appeal has one physical row" "select count(*) from public.integrity_case_appeals where sanction_id='$SANCTION_ID'::uuid and submitted_via<>'organizer';" "1"
rpc_request "$REPORTER_B_TOKEN" v3_submit_integrity_appeal "$APPEAL_SUBMIT_PAYLOAD"
expect_client_failure "cross-reporter participant receipt replay is rejected"
assert_db_eq "cross-reporter attempt leaves one appeal" "select count(*) from public.integrity_case_appeals where sanction_id='$SANCTION_ID'::uuid and submitted_via<>'organizer';" "1"

rpc_request "$REPORTER_A_TOKEN" reporter_submit_integrity_appeal "{\"_case_id\":\"$APPEAL_CASE\",\"_sanction_id\":\"$SANCTION_ID\",\"_grounds\":\"A second appeal for the same sanction must be rejected without changing state.\"}"
expect_failure "duplicate reporter appeal is rejected"
assert_db_eq "duplicate rejection leaves one reporter appeal" "select count(*) from public.integrity_case_appeals where sanction_id='$SANCTION_ID'::uuid and submitted_via<>'organizer';" "1"

rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$ORGANIZER_A_ID\"}"
expect_failure "original finding/sanction author cannot review the appeal"
assert_db_eq "conflicted reviewer failure leaves appeal unassigned" "select assigned_reviewer is null from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "t"

# Temporarily grant the reporter authoritative Organizer access solely to prove
# the overlap case: being an Organizer does not let an appellant review their own appeal.
db_exec "insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by) values ('$REPORTER_A_ID'::uuid,'organizer',null,null,null) on conflict do nothing;"
rpc_request "$ORGANIZER_B_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$REPORTER_A_ID\"}"
expect_failure "organizer-role appellant cannot review their own appeal"
assert_db_eq "self-review rejection leaves appeal unassigned" "select assigned_reviewer is null from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "t"

# Permission Engine v2 must NOT accept expired global Organizer assignments as
# independent appeal reviewers. Seed the role with a past validity window in
# this disposable database; this does not grant live production access.
db_exec "insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by,created_at) values ('$PARTICIPANT_ID'::uuid,'organizer',null,now()-interval '1 minute',null,now()-interval '2 minutes') on conflict do nothing;"
rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$PARTICIPANT_ID\"}"
expect_failure "expired global organizer cannot review appeals"
prepare_integrity_operation "expired-organizer-appeal-decision" "$APPEAL_ID"
APPEAL_VERSION="$(integrity_appeal_version "$APPEAL_ID")"
rpc_request "$PARTICIPANT_TOKEN" studio2_integrity_resolve_appeal "{\"p_appeal_id\":\"$APPEAL_ID\",\"p_outcome\":\"upheld\",\"p_decision_rationale\":\"Expired organizer role cannot authorize this reviewed appeal decision.\",\"p_replacement_level\":null,\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$APPEAL_VERSION}"
expect_client_failure "expired Organizer cannot invoke canonical appeal command"
assert_db_eq "expired Organizer denial preserves submitted appeal" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "submitted"
assert_db_eq "expired reviewer denial leaves appeal unassigned" "select assigned_reviewer is null from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "t"

rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$ORGANIZER_B_ID\"}"
expect_success "fresh organizer B is assigned appeal review"
prepare_integrity_operation "wrong-appeal-reviewer" "$APPEAL_ID"
APPEAL_VERSION="$(integrity_appeal_version "$APPEAL_ID")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_resolve_appeal "{\"p_appeal_id\":\"$APPEAL_ID\",\"p_outcome\":\"upheld\",\"p_decision_rationale\":\"Wrong reviewer is forbidden to decide an assigned Integrity appeal.\",\"p_replacement_level\":null,\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$APPEAL_VERSION}"
expect_client_failure "nonassigned Organizer cannot decide appeal"
assert_db_eq "wrong reviewer denial leaves appeal under review" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "under_review"
prepare_integrity_operation "illegal-appeal-reduction" "$APPEAL_ID"
APPEAL_VERSION="$(integrity_appeal_version "$APPEAL_ID")"
rpc_request "$ORGANIZER_B_TOKEN" studio2_integrity_resolve_appeal "{\"p_appeal_id\":\"$APPEAL_ID\",\"p_outcome\":\"reduced\",\"p_decision_rationale\":\"An invalid reduction cannot retain or increase the original sanction level.\",\"p_replacement_level\":5,\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$APPEAL_VERSION}"
expect_failure "illegal appeal reduction level is rejected"
expect_json_value "illegal reduction business-rule SQLSTATE" code 23514
assert_db_eq "illegal reduction does not consume appeal version" "select version from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "$APPEAL_VERSION"
assert_db_eq "illegal reduction leaves appeal under review" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "under_review"
prepare_integrity_operation "valid-appeal-upheld" "$APPEAL_ID"
APPEAL_VERSION="$(integrity_appeal_version "$APPEAL_ID")"
APPEAL_UPHELD_PAYLOAD="{\"p_appeal_id\":\"$APPEAL_ID\",\"p_outcome\":\"upheld\",\"p_decision_rationale\":\"Fresh reviewer confirms the controlled sanction after reconsidering the rehearsal evidence.\",\"p_replacement_level\":null,\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$APPEAL_VERSION}"
rpc_request "$ORGANIZER_B_TOKEN" studio2_integrity_resolve_appeal "$APPEAL_UPHELD_PAYLOAD"
expect_success "fresh reviewer records final appeal outcome"
APPEAL_DECIDED_VERSION="$(integrity_appeal_version "$APPEAL_ID")"
(( APPEAL_DECIDED_VERSION > APPEAL_VERSION )) || fail "Canonical appeal decision did not advance the appeal version"
rpc_request "$ORGANIZER_B_TOKEN" studio2_integrity_resolve_appeal "$APPEAL_UPHELD_PAYLOAD"
expect_success "identical resolved appeal operation safely replays"
expect_json_value "replayed appeal outcome is unchanged" outcome upheld
CONFLICT_APPEAL_PAYLOAD="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p["p_decision_rationale"]="Different final appeal rationale"; print(json.dumps(p,separators=(",",":")))' "$APPEAL_UPHELD_PAYLOAD")"
rpc_request "$ORGANIZER_B_TOKEN" studio2_integrity_resolve_appeal "$CONFLICT_APPEAL_PAYLOAD"
expect_client_failure "same appeal operation with changed payload is rejected"
prepare_integrity_operation "stale-finalized-appeal" "$APPEAL_ID"
STALE_APPEAL_PAYLOAD="$(integrity_test_payload "$APPEAL_UPHELD_PAYLOAD" "$OPERATION_ID" "$IDEMPOTENCY_KEY" "$APPEAL_VERSION")"
rpc_request "$ORGANIZER_B_TOKEN" studio2_integrity_resolve_appeal "$STALE_APPEAL_PAYLOAD"
expect_client_failure "finalized appeal rejects a stale reviewed version"
expect_json_value "stale appeal conflict SQLSTATE" code PT409
assert_db_eq "negative appeal retries preserve upheld outcome" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "upheld"
rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$ORGANIZER_A_ID\"}"
expect_failure "final appeal cannot be reassigned"
assert_db_eq "final appeal status remains upheld" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "upheld"

create_protected_case "$REPORTER_B_TOKEN" confidential report "Late appeal extension case"; LATE_CASE="$LAST_CASE_ID"
prepare_integrity_operation "late-appeal-finding" "$LATE_CASE"
CASE_VERSION="$(integrity_case_version "$LATE_CASE")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_finding "{\"p_case_id\":\"$LATE_CASE\",\"p_outcome\":\"violation\",\"p_summary\":\"Late appeal rehearsal violation\",\"p_rationale\":\"This second controlled violation exists only to test exceptional appeal extension limits.\",\"p_rule_ids\":[\"11.2\"],\"p_visible_to_reporter\":true,\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$CASE_VERSION}"
expect_success "record late-appeal finding"; LATE_FINDING="$(printf '%s' "$HTTP_BODY" | json_value finding_id)"
prepare_integrity_operation "late-appeal-sanction" "$LATE_CASE"
CASE_VERSION="$(integrity_case_version "$LATE_CASE")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_sanction "{\"p_case_id\":\"$LATE_CASE\",\"p_finding_id\":\"$LATE_FINDING\",\"p_typical_level\":4,\"p_final_level\":4,\"p_target_type\":\"participant\",\"p_target_reference\":\"late-security-rehearsal\",\"p_aggravating_factors\":[],\"p_mitigating_factors\":[],\"p_rationale\":\"Controlled sanction timestamp will be moved backward to test late-appeal extensions.\",\"p_visible_to_reporter\":true,\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$CASE_VERSION}"
expect_success "record late-appeal sanction"; LATE_SANCTION="$(printf '%s' "$HTTP_BODY" | json_value sanction_id)"
db_exec "update public.integrity_case_sanctions set effective_at=now()-interval '3 days' where id='$LATE_SANCTION'::uuid;"
rpc_request "$REPORTER_B_TOKEN" reporter_submit_integrity_appeal "{\"_case_id\":\"$LATE_CASE\",\"_sanction_id\":\"$LATE_SANCTION\",\"_grounds\":\"This intentionally late appeal exists to verify the exceptional extension ceiling.\"}"
expect_success "late appeal is recorded as rejected-late"; LATE_APPEAL="$(printf '%s' "$HTTP_BODY" | json_value appeal_id)"
assert_db_eq "late appeal status is rejected_late" "select status from public.integrity_case_appeals where id='$LATE_APPEAL'::uuid;" "rejected_late"
TOO_LATE_DEADLINE="$(db_scalar "select to_char(deadline_at + interval '15 days','YYYY-MM-DD\"T\"HH24:MI:SSOF') from public.integrity_case_appeals where id='$LATE_APPEAL'::uuid;")"
rpc_request "$ORGANIZER_A_TOKEN" admin_grant_integrity_appeal_extension "{\"_appeal_id\":\"$LATE_APPEAL\",\"_new_deadline\":\"$TOO_LATE_DEADLINE\",\"_reason\":\"Attempting an extension beyond the absolute fourteen-day security ceiling.\"}"
expect_failure "appeal extension beyond 14 days is rejected"
assert_db_eq "invalid extension leaves rejected-late state unchanged" "select status||':'||(extension_granted_at is null)::text from public.integrity_case_appeals where id='$LATE_APPEAL'::uuid;" "rejected_late:true"

log "Rule-governance hostile tests"
INTERPRETATIONS_BEFORE="$(db_scalar "select count(*) from public.ssc_rule_interpretations;")"
rpc_request "$ORGANIZER_A_TOKEN" admin_create_rule_interpretation "{\"_title\":\"Fake rule test\",\"_question\":\"Can an unknown rule be interpreted?\",\"_interpretation\":\"The database must reject this interpretation because its rule ID is not canonical.\",\"_rationale\":\"Security rehearsal proves unknown current rule identifiers cannot enter governance records.\",\"_rule_ids\":[\"99.99\"],\"_effective_from\":null}"
expect_failure "interpretation against unknown rule ID is rejected"
assert_db_eq "fake-rule rejection creates no interpretation" "select count(*) from public.ssc_rule_interpretations;" "$INTERPRETATIONS_BEFORE"

rpc_request "$ORGANIZER_A_TOKEN" admin_create_rule_interpretation "{\"_title\":\"Published immutability rehearsal\",\"_question\":\"Can a published interpretation be edited in place?\",\"_interpretation\":\"Published interpretations remain immutable and must be superseded by a separate record.\",\"_rationale\":\"This controlled record proves the published governance immutability boundary at runtime.\",\"_rule_ids\":[\"11.2\"],\"_effective_from\":null}"
expect_success "create valid interpretation draft"; INTERPRETATION_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
rpc_request "$ORGANIZER_A_TOKEN" admin_publish_rule_interpretation "{\"_id\":\"$INTERPRETATION_ID\"}"
expect_success "publish interpretation for immutability test"
ORIGINAL_TITLE="$(db_scalar "select title from public.ssc_rule_interpretations where id='$INTERPRETATION_ID'::uuid;")"
rpc_request "$ORGANIZER_A_TOKEN" admin_update_rule_interpretation "{\"_id\":\"$INTERPRETATION_ID\",\"_title\":\"Illicit rewrite\",\"_question\":\"This update should never be accepted.\",\"_interpretation\":\"This attempted rewrite must be rejected because the interpretation is already published.\",\"_rationale\":\"State must remain unchanged after the rejected mutation attempt for the security gate.\",\"_rule_ids\":[\"11.2\"],\"_effective_from\":null}"
expect_failure "published interpretation cannot be edited"
assert_db_eq "published interpretation title stays unchanged after rejected edit" "select title from public.ssc_rule_interpretations where id='$INTERPRETATION_ID'::uuid;" "$ORIGINAL_TITLE"

# Create two drafts from the same current base. Publishing 4.1 makes the 4.2
# draft stale; a future-effective publication must also be refused before it can
# displace the current rulebook.
rpc_request "$ORGANIZER_A_TOKEN" admin_create_rulebook_release "{\"_version\":\"4.1\",\"_title\":\"Security rehearsal 4.1\",\"_summary\":\"Controlled release used only by the local hostile publication tests.\",\"_base_version\":\"4.0\"}"
expect_success "create rulebook 4.1 draft"; RELEASE_41="$(printf '%s' "$HTTP_BODY" | json_value id)"
rpc_request "$ORGANIZER_A_TOKEN" admin_upsert_rulebook_change "{\"_release_id\":\"$RELEASE_41\",\"_rule_id\":\"1.1\",\"_change_kind\":\"modified\",\"_before_snapshot\":{\"title\":\"Before\",\"summary\":\"Before\"},\"_after_snapshot\":{\"title\":\"After\",\"summary\":\"After\"},\"_rationale\":\"Security rehearsal change.\"}"
expect_success "add rulebook 4.1 change"
rpc_request "$ORGANIZER_A_TOKEN" admin_create_rulebook_release "{\"_version\":\"4.2\",\"_title\":\"Security rehearsal stale draft\",\"_summary\":\"Controlled stale-base release used only by the local hostile publication tests.\",\"_base_version\":\"4.0\"}"
expect_success "create parallel rulebook 4.2 draft"; RELEASE_42="$(printf '%s' "$HTTP_BODY" | json_value id)"
rpc_request "$ORGANIZER_A_TOKEN" admin_upsert_rulebook_change "{\"_release_id\":\"$RELEASE_42\",\"_rule_id\":\"1.1\",\"_change_kind\":\"modified\",\"_before_snapshot\":{\"title\":\"Before\",\"summary\":\"Before\"},\"_after_snapshot\":{\"title\":\"After 4.2\",\"summary\":\"After 4.2\"},\"_rationale\":\"Security rehearsal stale change.\"}"
expect_success "add rulebook 4.2 change"
FUTURE_EFFECTIVE="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(hours=1)).isoformat())')"
rpc_request "$ORGANIZER_A_TOKEN" admin_publish_rulebook_release "{\"_release_id\":\"$RELEASE_41\",\"_effective_from\":\"$FUTURE_EFFECTIVE\"}"
expect_failure "future-effective rulebook cannot become current early"
assert_db_eq "future publication failure keeps v4.0 current" "select version from public.ssc_rulebook_releases where is_current=true;" "4.0"

NOW_EFFECTIVE="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat())')"
rpc_request "$ORGANIZER_A_TOKEN" admin_publish_rulebook_release "{\"_release_id\":\"$RELEASE_41\",\"_effective_from\":\"$NOW_EFFECTIVE\"}"
expect_success "rulebook 4.1 publishes from the current base"
assert_db_eq "published 4.1 is current" "select version from public.ssc_rulebook_releases where is_current=true;" "4.1"
rpc_request "$ORGANIZER_A_TOKEN" admin_publish_rulebook_release "{\"_release_id\":\"$RELEASE_42\",\"_effective_from\":\"$NOW_EFFECTIVE\"}"
expect_failure "stale-base rulebook draft cannot publish"
assert_db_eq "stale-base failure leaves 4.2 as draft" "select status from public.ssc_rulebook_releases where id='$RELEASE_42'::uuid;" "draft"
assert_db_eq "stale-base failure leaves 4.1 current" "select version from public.ssc_rulebook_releases where is_current=true;" "4.1"

log "Retired adjudication REST RPCs must be absent for anon, authenticated and service_role"
LEGACY_FINDING_BODY="{\"_case_id\":\"$APPEAL_CASE\",\"_outcome\":\"violation\",\"_summary\":\"Legacy RPC retirement test\",\"_rationale\":\"Fully typed retirement probe with a valid case ID and valid finding business fields.\",\"_rule_ids\":[\"11.2\"],\"_visible_to_reporter\":true}"
LEGACY_SANCTION_BODY="{\"_case_id\":\"$APPEAL_CASE\",\"_finding_id\":\"$FINDING_ID\",\"_typical_level\":5,\"_final_level\":5,\"_target_type\":\"participant\",\"_target_reference\":\"retirement-test\",\"_aggravating_factors\":[],\"_mitigating_factors\":[],\"_rationale\":\"Fully typed retirement probe with a valid case and finding ID.\",\"_visible_to_reporter\":true}"
LEGACY_APPEAL_BODY="{\"_appeal_id\":\"$APPEAL_ID\",\"_outcome\":\"upheld\",\"_decision_rationale\":\"Fully typed retirement probe with valid appeal identity.\",\"_replacement_level\":null,\"_aggravating_factors\":[],\"_mitigating_factors\":[]}"

for LEGACY_ROLE in anon authenticated service_role; do
  case "$LEGACY_ROLE" in
    anon) LEGACY_TOKEN="$ANON_KEY" ;;
    authenticated) LEGACY_TOKEN="$ORGANIZER_A_TOKEN" ;;
    service_role) LEGACY_TOKEN="$SERVICE_ROLE_KEY" ;;
  esac
  assert_retired_integrity_rpc_absent "$LEGACY_TOKEN" admin_record_integrity_finding "$LEGACY_FINDING_BODY" "$LEGACY_ROLE"
  assert_retired_integrity_rpc_absent "$LEGACY_TOKEN" admin_record_integrity_sanction "$LEGACY_SANCTION_BODY" "$LEGACY_ROLE"
  assert_retired_integrity_rpc_absent "$LEGACY_TOKEN" admin_decide_integrity_appeal "$LEGACY_APPEAL_BODY" "$LEGACY_ROLE"
done

log "Canonical Integrity consolidation: positive operations, replay and hostile caller checks"
# This suite runs only against the local isolated Supabase instance. Exercise
# the actual JWT-bound commands, not their now-retired legacy writer paths.
prepare_integrity_operation "p04-priority" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
P04_PRIORITY="{\"p_case_id\":\"$APPEAL_CASE\",\"p_priority\":\"high\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_set_case_priority "$P04_PRIORITY"
expect_success "canonical priority update with reviewed revision"
assert_db_eq "priority write persisted" "select priority from public.integrity_cases where id='$APPEAL_CASE'::uuid;" "high"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_set_case_priority "$P04_PRIORITY"
expect_success "canonical priority idempotent replay"
assert_db_eq "priority writes exactly one action event" "select count(*) from public.integrity_case_events where case_id='$APPEAL_CASE'::uuid and event_type='priority.changed';" "1"
prepare_integrity_operation "p04-priority-stale" "$APPEAL_CASE"
P04_PRIORITY_STALE="{\"p_case_id\":\"$APPEAL_CASE\",\"p_priority\":\"urgent\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_set_case_priority "$P04_PRIORITY_STALE"
expect_client_failure "canonical priority stale case revision rejected"
expect_json_value "canonical priority stale conflict HTTP code" code PT409

prepare_integrity_operation "p04-note" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
P04_NOTE="{\"p_case_id\":\"$APPEAL_CASE\",\"p_body\":\"Private investigator note for single-authority rehearsal.\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_add_case_note "$P04_NOTE"
expect_success "canonical confidential investigator note"
assert_db_eq "internal note persisted" "select count(*) from public.integrity_case_internal_notes where case_id='$APPEAL_CASE'::uuid and body='Private investigator note for single-authority rehearsal.';" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_add_case_note "$P04_NOTE"
expect_success "canonical internal note replay"
assert_db_eq "internal note not duplicated" "select count(*) from public.integrity_case_internal_notes where case_id='$APPEAL_CASE'::uuid and body='Private investigator note for single-authority rehearsal.';" "1"
prepare_integrity_operation "p04-note-attacker" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
rpc_request "$PARTICIPANT_TOKEN" studio2_integrity_add_case_note "{\"p_case_id\":\"$APPEAL_CASE\",\"p_body\":\"Unauthorized disclosure attempt.\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
expect_client_failure "ordinary participant cannot add confidential case note"

prepare_integrity_operation "p04-reply" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
P04_REPLY="{\"p_case_id\":\"$APPEAL_CASE\",\"p_body\":\"Organizer-controlled follow-up for the approved review record.\",\"p_request_response\":false,\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_reply_case "$P04_REPLY"
expect_success "canonical organizer reply"
assert_db_eq "reply message written" "select count(*) from public.integrity_case_messages where case_id='$APPEAL_CASE'::uuid and author_role='tsbc' and body='Organizer-controlled follow-up for the approved review record.';" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_reply_case "$P04_REPLY"
expect_success "canonical reply replay"
assert_db_eq "reply not duplicated" "select count(*) from public.integrity_case_messages where case_id='$APPEAL_CASE'::uuid and author_role='tsbc' and body='Organizer-controlled follow-up for the approved review record.';" "1"

prepare_integrity_operation "p04-recusal" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
P04_RECUSAL="{\"p_case_id\":\"$APPEAL_CASE\",\"p_reason\":\"Recusal due to the controlled rehearsal conflict.\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_recuse_case_reviewer "$P04_RECUSAL"
expect_success "canonical conflict-of-interest recusal"
assert_db_eq "recusal action event persisted" "select count(*) from public.integrity_case_events where case_id='$APPEAL_CASE'::uuid and event_type='reviewer.recused';" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_recuse_case_reviewer "$P04_RECUSAL"
expect_success "canonical recusal replay"
assert_db_eq "recusal does not emit duplicate action" "select count(*) from public.integrity_case_events where case_id='$APPEAL_CASE'::uuid and event_type='reviewer.recused';" "1"

RETENTION_AT="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(days=45)).isoformat())')"
prepare_integrity_operation "p04-retention" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
P04_RETENTION="{\"p_case_id\":\"$APPEAL_CASE\",\"p_retention_until\":\"$RETENTION_AT\",\"p_reason\":\"Retain case evidence for the controlled appeal and audit history.\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_set_case_retention "$P04_RETENTION"
expect_success "canonical evidence retention schedule"
assert_db_eq "retention event persisted" "select count(*) from public.integrity_case_events where case_id='$APPEAL_CASE'::uuid and event_type='retention.updated';" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_set_case_retention "$P04_RETENTION"
expect_success "canonical retention replay"
assert_db_eq "retention replay leaves one event" "select count(*) from public.integrity_case_events where case_id='$APPEAL_CASE'::uuid and event_type='retention.updated';" "1"

# Pre-clearance rulings are restricted to a private rule_question case. Both
# acceptance and non-rule-question denial must survive writer consolidation.
create_protected_case "$REPORTER_B_TOKEN" confidential rule_question "Private rule clarification rehearsal case"; P04_PRECLEARANCE_CASE="$LAST_CASE_ID"
prepare_integrity_operation "p04-preclearance" "$P04_PRECLEARANCE_CASE"
REVIEW_VERSION="$(integrity_case_version "$P04_PRECLEARANCE_CASE")"
P04_PRECLEARANCE="{\"p_case_id\":\"$P04_PRECLEARANCE_CASE\",\"p_outcome\":\"guidance_only\",\"p_summary\":\"Controlled rehearsal guidance\",\"p_rationale\":\"This private rule question tests permitted pre-clearance decisions without a public finding.\",\"p_rule_ids\":[\"11.2\"],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_preclearance_ruling "$P04_PRECLEARANCE"
expect_success "canonical private pre-clearance ruling"
P04_RULING_ID="$(printf '%s' "$HTTP_BODY" | json_value ruling_id)"
[[ -n "$P04_RULING_ID" ]] || fail "Pre-clearance command returned no ruling receipt"
assert_db_eq "pre-clearance rule cited correctly" "select count(*) from public.integrity_preclearance_rulings where id='$P04_RULING_ID'::uuid and case_id='$P04_PRECLEARANCE_CASE'::uuid and outcome='guidance_only';" "1"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_preclearance_ruling "$P04_PRECLEARANCE"
expect_success "canonical pre-clearance replay"
expect_json_value "replayed pre-clearance returns original ruling id" ruling_id "$P04_RULING_ID"
prepare_integrity_operation "p04-preclearance-invalid-case" "$APPEAL_CASE"
REVIEW_VERSION="$(integrity_case_version "$APPEAL_CASE")"
rpc_request "$ORGANIZER_A_TOKEN" studio2_integrity_record_preclearance_ruling "{\"p_case_id\":\"$APPEAL_CASE\",\"p_outcome\":\"guidance_only\",\"p_summary\":\"Not a rules question\",\"p_rationale\":\"This normal report must never admit a private rule-question ruling.\",\"p_rule_ids\":[\"11.2\"],\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$REVIEW_VERSION}"
expect_client_failure "pre-clearance command cannot rule on an ordinary report"

log "All live Rules + Integrity adversarial checks passed"
