#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-security] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-security] FAIL: %s\n' "$*" >&2; exit 1; }

# This rehearsal is intentionally hostile and intentionally local-only. Never
# point it at hosted Supabase: it creates disposable users and canonical rows.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3ConfirmationSecurity2026!'
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
  log "PASS: $label"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

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

COUNTRY_A='00000000-0000-4000-8000-00000000c521'
COUNTRY_B='00000000-0000-4000-8000-00000000c522'
EDITION_ID='00000000-0000-4000-8000-00000000e521'
ROUND_ID='00000000-0000-4000-8000-00000000a521'
OTHER_ROUND_ID='00000000-0000-4000-8000-00000000a522'
OPERATION_ID='00000000-0000-4000-8000-00000000b521'
RECEIPT_ID='00000000-0000-4000-8000-00000000d521'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f521'
SESSION_A='v3-security-session-a'
SESSION_B='v3-security-session-b'
REPLAY_PAYLOAD="{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_A\"}"
REQUEST_HASH="$(db_scalar "select encode(extensions.digest(convert_to(('$REPLAY_PAYLOAD')::jsonb::text, 'UTF8'), 'sha256'), 'hex');")"

log "Creating isolated hostile-test identities"
create_user v3-confirmation-a@solaris.invalid; USER_A_ID="$LAST_USER_ID"
create_user v3-confirmation-b@solaris.invalid; USER_B_ID="$LAST_USER_ID"
sign_in v3-confirmation-a@solaris.invalid; USER_A_TOKEN="$LAST_TOKEN"
sign_in v3-confirmation-b@solaris.invalid; USER_B_TOKEN="$LAST_TOKEN"

log "Seeding disposable canonical context"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_A','V3 Security A','V3A'),('$COUNTRY_B','V3 Security B','V3B');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','V3 Confirmation Security',2026,'v3-confirmation-security',9521,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','Security round','open',now()-interval '1 hour',now()+interval '1 hour',true),('$OTHER_ROUND_ID','$EDITION_ID','Other security round','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.country_accounts(user_id,country_id,status) values ('$USER_A_ID','$COUNTRY_A','active'),('$USER_B_ID','$COUNTRY_B','active');"

log "Private ledgers reject direct public-role access"
expect_db_failure "anon cannot read private operation ledger" "set local role anon; select count(*) from private.v3_confirmation_operations;"
expect_db_failure "authenticated cannot read private operation ledger" "set local role authenticated; select count(*) from private.v3_confirmation_operations;"
expect_db_failure "anon cannot read private account-draft ledger" "set local role anon; select count(*) from private.v3_confirmation_account_drafts;"
expect_db_failure "authenticated cannot read private account-draft ledger" "set local role authenticated; select count(*) from private.v3_confirmation_account_drafts;"

log "Country-account draft authority rejects anonymous callers"
rpc_request "$ANON_KEY" v3_load_account_confirmation_draft "{\"_round_id\":\"$ROUND_ID\"}"
expect_failure "anonymous account-draft load"
rpc_request "$ANON_KEY" v3_save_account_confirmation_draft "{\"_round_id\":\"$ROUND_ID\",\"_payload\":{\"payload\":{\"country\":\"attacker\"},\"step\":1},\"_expected_revision\":0}"
expect_failure "anonymous account-draft save"

log "Country-account draft CAS prevents stale overwrite"
rpc_request "$USER_A_TOKEN" v3_save_account_confirmation_draft "{\"_round_id\":\"$ROUND_ID\",\"_payload\":{\"payload\":{\"country\":\"V3 Security A\"},\"step\":2},\"_expected_revision\":0}"
expect_success "country A initial draft save"
expect_json "country A initial draft accepted" ok true
expect_json "country A initial revision" revision 1

rpc_request "$USER_A_TOKEN" v3_save_account_confirmation_draft "{\"_round_id\":\"$ROUND_ID\",\"_payload\":{\"payload\":{\"country\":\"STALE OVERWRITE\"},\"step\":3},\"_expected_revision\":0}"
expect_success "stale account draft request returns structured conflict"
expect_json "stale account draft rejected" ok false
expect_json "stale account draft conflict" conflict true
expect_json "stale account draft canonical revision returned" revision 1
expect_json "stale account draft canonical payload preserved" payload.payload.country "V3 Security A"

rpc_request "$USER_B_TOKEN" v3_load_account_confirmation_draft "{\"_round_id\":\"$ROUND_ID\"}"
expect_success "country B account draft load"
expect_json "country B cannot see country A draft" found false

log "Browser-session draft CAS prevents stale same-session writers"
rpc_request "$ANON_KEY" v3_save_confirmation_draft "{\"_round_id\":\"$ROUND_ID\",\"_browser_session_id\":\"$SESSION_A\",\"_payload\":{\"payload\":{\"country\":\"Browser canonical\"},\"step\":1},\"_expected_revision\":0,\"_instagram_username\":\"security\",\"_country\":\"V3 Security A\",\"_ip\":\"127.0.0.1\"}"
expect_success "browser draft initial save"
expect_json "browser draft initial revision" revision 1
rpc_request "$ANON_KEY" v3_save_confirmation_draft "{\"_round_id\":\"$ROUND_ID\",\"_browser_session_id\":\"$SESSION_A\",\"_payload\":{\"payload\":{\"country\":\"Stale browser overwrite\"},\"step\":2},\"_expected_revision\":0,\"_instagram_username\":\"security\",\"_country\":\"V3 Security A\",\"_ip\":\"127.0.0.1\"}"
expect_success "stale browser draft request returns structured conflict"
expect_json "stale browser draft rejected" ok false
expect_json "stale browser draft conflict" conflict true
expect_json "stale browser canonical payload returned" payload.payload.country "Browser canonical"

log "Seeding one accepted operation for replay/scope attacks"
db_exec "insert into private.v3_confirmation_operations(idempotency_key,request_hash,round_id,browser_session_id,result,receipt_id,accepted_at) values ('$OPERATION_ID','$REQUEST_HASH','$ROUND_ID','$SESSION_A',jsonb_build_object('ok',true,'submission_id','$SUBMISSION_ID'),'$RECEIPT_ID',now());"

rpc_request "$ANON_KEY" v3_reconcile_confirmation "{\"_idempotency_key\":\"$OPERATION_ID\",\"_browser_session_id\":\"$SESSION_A\"}"
expect_success "exact operation reconciliation"
expect_json "exact operation found" found true
expect_json "exact reconciliation receipt stable" receipt.receipt_id "$RECEIPT_ID"
expect_json "reconciliation marked replay" receipt.replayed true

rpc_request "$ANON_KEY" v3_reconcile_confirmation "{\"_idempotency_key\":\"$OPERATION_ID\",\"_browser_session_id\":\"$SESSION_B\"}"
expect_success "wrong-session reconciliation remains non-enumerating"
expect_json "wrong session cannot recover operation" found false

log "Idempotency-key replay is stable and mismatched reuse is rejected"
rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":$REPLAY_PAYLOAD,\"_idempotency_key\":\"$OPERATION_ID\",\"_request_hash\":\"caller-supplied-hash-is-not-authority\",\"_browser_session_id\":\"$SESSION_A\"}"
expect_success "same logical operation replay ignores caller hash"
expect_json "replay keeps original receipt" receipt.receipt_id "$RECEIPT_ID"
expect_json "replay flag true" receipt.replayed true
expect_json "replay keeps original submission" submission_id "$SUBMISSION_ID"

rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_A\",\"country\":\"tampered\"},\"_idempotency_key\":\"$OPERATION_ID\",\"_request_hash\":\"$REQUEST_HASH\",\"_browser_session_id\":\"$SESSION_A\"}"
expect_failure "same idempotency key with different logical payload"

rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_A\"},\"_idempotency_key\":\"$OPERATION_ID\",\"_request_hash\":\"$REQUEST_HASH\",\"_browser_session_id\":\"$SESSION_B\"}"
expect_failure "browser-session parameter cannot contradict payload"

rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_B\"},\"_idempotency_key\":\"$OPERATION_ID\",\"_request_hash\":\"$REQUEST_HASH\",\"_browser_session_id\":\"$SESSION_B\"}"
expect_failure "same idempotency key with different browser session"

log "Receipt lookup requires exact round, session and accepted submission"
rpc_request "$ANON_KEY" v3_lookup_confirmation_receipt "{\"_round_id\":\"$ROUND_ID\",\"_browser_session_id\":\"$SESSION_A\",\"_submission_id\":\"$SUBMISSION_ID\"}"
expect_success "exact receipt lookup"
expect_json "exact receipt found" found true
expect_json "exact receipt id" receipt.receipt_id "$RECEIPT_ID"

rpc_request "$ANON_KEY" v3_lookup_confirmation_receipt "{\"_round_id\":\"$ROUND_ID\",\"_browser_session_id\":\"$SESSION_B\",\"_submission_id\":\"$SUBMISSION_ID\"}"
expect_success "wrong-session receipt lookup"
expect_json "wrong session cannot recover receipt" found false
rpc_request "$ANON_KEY" v3_lookup_confirmation_receipt "{\"_round_id\":\"$OTHER_ROUND_ID\",\"_browser_session_id\":\"$SESSION_A\",\"_submission_id\":\"$SUBMISSION_ID\"}"
expect_success "wrong-round receipt lookup"
expect_json "wrong round cannot recover receipt" found false
rpc_request "$ANON_KEY" v3_lookup_confirmation_receipt "{\"_round_id\":\"$ROUND_ID\",\"_browser_session_id\":\"$SESSION_A\",\"_submission_id\":\"00000000-0000-4000-8000-00000000f522\"}"
expect_success "wrong-submission receipt lookup"
expect_json "wrong submission cannot recover receipt" found false

[[ "$(db_scalar "select count(*) from private.v3_confirmation_operations where idempotency_key='$OPERATION_ID'::uuid;")" == "1" ]] || fail "hostile replay created more than one operation row"
[[ "$(db_scalar "select count(*) from private.v3_confirmation_account_drafts where round_id='$ROUND_ID'::uuid and country_id='$COUNTRY_A'::uuid;")" == "1" ]] || fail "stale account writer duplicated canonical draft"

log "PASS: V3 Confirmation hostile security rehearsal complete"


log "Me activity is server-owned and restricted to the caller's active delegation"
rpc_request "$ANON_KEY" v3_me_confirmation_summary '{}'
expect_failure "anonymous Me summary denied"
rpc_request "$USER_A_TOKEN" v3_me_confirmation_summary '{}'
expect_success "own delegation summary"
expect_json "own delegation scope" country_id "$COUNTRY_A"
expect_json "own receipt count" receipt_count 1
rpc_request "$USER_B_TOKEN" v3_me_confirmation_summary '{}'
expect_success "other delegation summary"
expect_json "other delegation scope" country_id "$COUNTRY_B"
expect_json "other delegation does not count A receipts" receipt_count 0
# A receipt with a real submission ID but the wrong round is not attributable.
db_exec "insert into private.v3_confirmation_operations(idempotency_key,request_hash,round_id,browser_session_id,result) values ('00000000-0000-4000-8000-00000000f529','me-scope-mismatch','$OTHER_ROUND_ID','me-fixture',jsonb_build_object('submission_id','$SUBMISSION_ID'));"
rpc_request "$USER_A_TOKEN" v3_me_confirmation_summary '{}'
expect_success "receipt round binding"
expect_json "wrong-round operation excluded" receipt_count 1
db_exec "update public.country_accounts set status='suspended' where user_id='$USER_A_ID'::uuid;"
rpc_request "$USER_A_TOKEN" v3_me_confirmation_summary '{}'
expect_success "suspended summary remains non-enumerating"
expect_json "suspended summary unavailable" available false
expect_json "suspended count remains unknown" receipt_count ''
db_exec "update public.country_accounts set status='active' where user_id='$USER_A_ID'::uuid;"
db_exec "begin transaction read only; set local role authenticated; select set_config('request.jwt.claims',jsonb_build_object('sub','$USER_A_ID','role','authenticated')::text,true); select public.v3_me_confirmation_summary(); rollback;"
log "PASS: Me delegation receipt scope and read-only access verified"
