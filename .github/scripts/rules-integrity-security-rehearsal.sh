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
rpc_request "$ORGANIZER_A_TOKEN" admin_record_integrity_finding "{\"_case_id\":\"$APPEAL_CASE\",\"_outcome\":\"violation\",\"_summary\":\"Confirmed rehearsal violation\",\"_rationale\":\"The controlled rehearsal establishes a violation for appeal-boundary testing only.\",\"_rule_ids\":[\"11.2\"],\"_visible_to_reporter\":true}"
expect_success "organizer records appeal-test finding"; FINDING_ID="$(printf '%s' "$HTTP_BODY" | json_value finding_id)"
rpc_request "$ORGANIZER_A_TOKEN" admin_record_integrity_sanction "{\"_case_id\":\"$APPEAL_CASE\",\"_finding_id\":\"$FINDING_ID\",\"_typical_level\":5,\"_final_level\":5,\"_target_type\":\"participant\",\"_target_reference\":\"security-rehearsal\",\"_aggravating_factors\":[],\"_mitigating_factors\":[],\"_rationale\":\"Controlled Level 5 sanction used to prove appeal authorization boundaries.\",\"_visible_to_reporter\":true}"
expect_success "organizer records appeal-test sanction"; SANCTION_ID="$(printf '%s' "$HTTP_BODY" | json_value sanction_id)"
rpc_request "$REPORTER_A_TOKEN" reporter_submit_integrity_appeal "{\"_case_id\":\"$APPEAL_CASE\",\"_sanction_id\":\"$SANCTION_ID\",\"_grounds\":\"The controlled rehearsal submits a valid appeal to exercise fresh-review rules.\"}"
expect_success "reporter submits first appeal"; APPEAL_ID="$(printf '%s' "$HTTP_BODY" | json_value appeal_id)"

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

rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$ORGANIZER_B_ID\"}"
expect_success "fresh organizer B is assigned appeal review"
rpc_request "$ORGANIZER_B_TOKEN" admin_decide_integrity_appeal "{\"_appeal_id\":\"$APPEAL_ID\",\"_outcome\":\"reduced\",\"_decision_rationale\":\"An invalid reduction cannot retain or increase the original sanction level.\",\"_replacement_level\":5,\"_aggravating_factors\":[],\"_mitigating_factors\":[]}"
expect_failure "illegal appeal reduction level is rejected"
assert_db_eq "illegal reduction leaves appeal under review" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "under_review"
rpc_request "$ORGANIZER_B_TOKEN" admin_decide_integrity_appeal "{\"_appeal_id\":\"$APPEAL_ID\",\"_outcome\":\"upheld\",\"_decision_rationale\":\"Fresh reviewer confirms the controlled sanction after reconsidering the rehearsal evidence.\",\"_replacement_level\":null,\"_aggravating_factors\":[],\"_mitigating_factors\":[]}"
expect_success "fresh reviewer records final appeal outcome"
rpc_request "$ORGANIZER_A_TOKEN" admin_assign_integrity_appeal_reviewer "{\"_appeal_id\":\"$APPEAL_ID\",\"_user_id\":\"$ORGANIZER_A_ID\"}"
expect_failure "final appeal cannot be reassigned"
assert_db_eq "final appeal status remains upheld" "select status from public.integrity_case_appeals where id='$APPEAL_ID'::uuid;" "upheld"

create_protected_case "$REPORTER_B_TOKEN" confidential report "Late appeal extension case"; LATE_CASE="$LAST_CASE_ID"
rpc_request "$ORGANIZER_A_TOKEN" admin_record_integrity_finding "{\"_case_id\":\"$LATE_CASE\",\"_outcome\":\"violation\",\"_summary\":\"Late appeal rehearsal violation\",\"_rationale\":\"This second controlled violation exists only to test exceptional appeal extension limits.\",\"_rule_ids\":[\"11.2\"],\"_visible_to_reporter\":true}"
expect_success "record late-appeal finding"; LATE_FINDING="$(printf '%s' "$HTTP_BODY" | json_value finding_id)"
rpc_request "$ORGANIZER_A_TOKEN" admin_record_integrity_sanction "{\"_case_id\":\"$LATE_CASE\",\"_finding_id\":\"$LATE_FINDING\",\"_typical_level\":4,\"_final_level\":4,\"_target_type\":\"participant\",\"_target_reference\":\"late-security-rehearsal\",\"_aggravating_factors\":[],\"_mitigating_factors\":[],\"_rationale\":\"Controlled sanction timestamp will be moved backward to test late-appeal extensions.\",\"_visible_to_reporter\":true}"
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

log "All live Rules + Integrity adversarial checks passed"
