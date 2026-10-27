#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-admin-beta-acceptance] %s\n' "$*"; }
fail() { printf '\n[v3-admin-beta-acceptance] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*|postgresql://postgres:postgres@\[::1\]:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3AdminBeta2026!'
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
  local output; output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$output")"
  rm -f "$output"
}
expect_success() { (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$1 returned HTTP $HTTP_STATUS: $HTTP_BODY"; log "PASS: $1"; }
expect_failure() { (( HTTP_STATUS >= 400 )) || fail "$1 unexpectedly succeeded: $HTTP_BODY"; log "PASS: $1 rejected with HTTP $HTTP_STATUS"; }

db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

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

EDITION_ID='00000000-0000-4000-8000-00000000d701'
SUBMISSION_ID='00000000-0000-4000-8000-00000000d702'
OPERATION_ID='00000000-0000-4000-8000-00000000d703'
REPLAY_OPERATION='00000000-0000-4000-8000-00000000d704'
KEY='v3-admin-beta-acceptance-d702'

log "Seed exact edition and two callers"
create_user v3-admin-beta-organizer@solaris.invalid; ORGANIZER_ID="$LAST_USER_ID"
create_user v3-admin-beta-foreign@solaris.invalid; FOREIGN_ID="$LAST_USER_ID"
sign_in v3-admin-beta-organizer@solaris.invalid; ORGANIZER_TOKEN="$LAST_TOKEN"
sign_in v3-admin-beta-foreign@solaris.invalid; FOREIGN_TOKEN="$LAST_TOKEN"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','V3 Admin Beta Acceptance','v3-admin-beta-acceptance',2701,2026,'active',false)
on conflict (id) do update set name=excluded.name;
insert into public.user_roles(user_id,role) values ('$ORGANIZER_ID','organizer') on conflict do nothing;
insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by)
values ('$ORGANIZER_ID'::uuid,'organizer',null,null,null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;
SQL

payload() {
  local tester="$1" operation="$2" key="$3" edition="$4"
  python3 - "$tester" "$operation" "$key" "$edition" "$SUBMISSION_ID" <<'PY'
import json,sys
name,operation,key,edition,submission=sys.argv[1:]
print(json.dumps({
  "p_edition_id": edition,
  "p_submission_id": submission,
  "p_tester_name": name,
  "p_device": "Laptop",
  "p_browser": "Chromium",
  "p_familiarity": "Organizer",
  "p_answers": {"organizerEditionId": edition, "priorityOne": "Ship governed evidence", "overallNow": 9},
  "p_bug_reports": [],
  "p_screenshot_paths": [],
  "p_user_agent": "v3-local-rehearsal",
  "p_form_version": 2,
  "p_operation_id": operation,
  "p_idempotency_key": key,
}))
PY
}

log "Submit one governed acceptance record"
BODY="$(payload 'Organizer One' "$OPERATION_ID" "$KEY" "$EDITION_ID")"
request POST "$API_URL/rest/v1/rpc/studio2_submit_admin_beta_test" "$ORGANIZER_TOKEN" "$ANON_KEY" "$BODY"
expect_success "governed acceptance submit"
[[ "$(printf '%s' "$HTTP_BODY" | json_value ok)" == 'true' ]] || fail "submit receipt missing ok"
[[ "$(printf '%s' "$HTTP_BODY" | json_value operationId)" == "$OPERATION_ID" ]] || fail "submit receipt operation mismatch"
[[ "$(db_value "select count(*) from public.admin_beta_test_submissions where id='$SUBMISSION_ID'::uuid and edition_id='$EDITION_ID'::uuid and submitted_by='$ORGANIZER_ID'::uuid;")" == '1' ]] || fail "canonical acceptance row missing exact actor/edition scope"

log "Replay exact semantic request without duplicating the row"
request POST "$API_URL/rest/v1/rpc/studio2_submit_admin_beta_test" "$ORGANIZER_TOKEN" "$ANON_KEY" "$BODY"
expect_success "same operation replay"
[[ "$(printf '%s' "$HTTP_BODY" | json_value replayed)" == 'true' ]] || fail "same operation did not replay"
[[ "$(db_value "select count(*) from public.admin_beta_test_submissions where id='$SUBMISSION_ID'::uuid;")" == '1' ]] || fail "replay duplicated acceptance row"

log "Reject changed semantic replay using the same idempotency key"
CHANGED="$(payload 'Changed Tester' "$REPLAY_OPERATION" "$KEY" "$EDITION_ID")"
request POST "$API_URL/rest/v1/rpc/studio2_submit_admin_beta_test" "$ORGANIZER_TOKEN" "$ANON_KEY" "$CHANGED"
expect_failure "changed semantic replay"
[[ "$HTTP_BODY" == *"IDEMPOTENCY_CONFLICT"* ]] || fail "changed semantic replay did not report IDEMPOTENCY_CONFLICT: $HTTP_BODY"

log "Reject a foreign caller and edition substitution"
request POST "$API_URL/rest/v1/rpc/studio2_submit_admin_beta_test" "$FOREIGN_TOKEN" "$ANON_KEY" "$BODY"
expect_failure "foreign caller"
WRONG_EDITION='00000000-0000-4000-8000-00000000d799'
WRONG="$(payload 'Organizer One' '00000000-0000-4000-8000-00000000d705' 'wrong-edition' "$WRONG_EDITION")"
request POST "$API_URL/rest/v1/rpc/studio2_submit_admin_beta_test" "$ORGANIZER_TOKEN" "$ANON_KEY" "$WRONG"
expect_failure "unknown edition substitution"

log "Direct authenticated table insert is no longer a browser authority"
request POST "$API_URL/rest/v1/admin_beta_test_submissions" "$ORGANIZER_TOKEN" "$ANON_KEY" '{"tester_name":"Direct","device":"Laptop","answers":{},"bug_reports":[]}'
expect_failure "direct authenticated table insert"

log "Canonical receipt readback proves the uncertain-outcome recovery path"
request POST "$API_URL/rest/v1/rpc/studio2_reconcile_operation" "$ORGANIZER_TOKEN" "$ANON_KEY" "{\"p_operation_id\":\"$OPERATION_ID\"}"
expect_success "acceptance receipt reconciliation"
[[ "$(printf '%s' "$HTTP_BODY" | json_value status)" == 'succeeded' ]] || fail "reconciliation did not return succeeded"
[[ "$(printf '%s' "$HTTP_BODY" | json_value result.submissionId)" == "$SUBMISSION_ID" ]] || fail "reconciliation returned wrong submission"

log "V3 governed Organizer acceptance rehearsal passed"
