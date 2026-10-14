#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-jury-security] %s\n' "$*"; }
fail() { printf '\n[v3-jury-security] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This script creates destructive fixtures. It is permitted only against the
# disposable local Supabase stack and must never acquire a hosted fallback.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3JurySecurity2026!'
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
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
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

COUNTRY_A='00000000-0000-4000-8000-00000000c701'
COUNTRY_B='00000000-0000-4000-8000-00000000c702'
COUNTRY_C='00000000-0000-4000-8000-00000000c703'
EDITION_ID='00000000-0000-4000-8000-00000000e701'
SHOW_ID='00000000-0000-4000-8000-00000000a701'
PREFLIGHT_ID='00000000-0000-4000-8000-00000000f701'
OPERATION_ID='00000000-0000-4000-8000-00000000b701'

log "Creating isolated country-account identities"
create_user v3-jury-a@solaris.invalid; USER_A_ID="$LAST_USER_ID"
create_user v3-jury-b@solaris.invalid; USER_B_ID="$LAST_USER_ID"
sign_in v3-jury-a@solaris.invalid; USER_A_TOKEN="$LAST_TOKEN"
sign_in v3-jury-b@solaris.invalid; USER_B_TOKEN="$LAST_TOKEN"

log "Seeding a disposable canonical Jury show"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_A','Jury Security A','JSA'),('$COUNTRY_B','Jury Security B','JSB'),('$COUNTRY_C','Jury Security C','JSC');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','V3 Jury Security',2026,'v3-jury-security',9701,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config) values ('$SHOW_ID','$EDITION_ID','Jury security final','final',1,false,jsonb_build_object('juryEnabled',true,'juryPoints',jsonb_build_array(12,10),'allowSelfVote',false));"
db_exec "insert into public.participants(edition_id,show_id,country_id,artist,song,running_order) values ('$EDITION_ID','$SHOW_ID','$COUNTRY_B','Artist B','Song B',1),('$EDITION_ID','$SHOW_ID','$COUNTRY_C','Artist C','Song C',2);"
db_exec "insert into public.voters(edition_id,show_id,country_id,name,sort_order) values ('$EDITION_ID','$SHOW_ID','$COUNTRY_A','Jury A',1);"
db_exec "insert into public.country_accounts(user_id,country_id,status) values ('$USER_A_ID','$COUNTRY_A','active'),('$USER_B_ID','$COUNTRY_B','active');"
db_exec "insert into public.jury_voting_windows(show_id,edition_id,status,opened_at,opened_by) values ('$SHOW_ID','$EDITION_ID','open',now(),'$USER_A_ID');"
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at) values ('$PREFLIGHT_ID',null,'jury-security-a','JSA',jsonb_build_object('$COUNTRY_B',12,'$COUNTRY_C',10),'jury','$EDITION_ID','$SHOW_ID','$USER_A_ID',now()+interval '20 minutes');"

log "Private ledgers reject direct client-role access"
expect_db_failure "anon cannot read Jury drafts" "set local role anon; select count(*) from private.v3_jury_drafts;"
expect_db_failure "authenticated cannot read Jury drafts" "set local role authenticated; select count(*) from private.v3_jury_drafts;"
expect_db_failure "anon cannot read Jury operations" "set local role anon; select count(*) from private.v3_jury_operations;"
expect_db_failure "authenticated cannot read Jury operations" "set local role authenticated; select count(*) from private.v3_jury_operations;"

log "Draft RPCs require an authenticated delegation and enforce CAS"
rpc_request "$ANON_KEY" v3_save_jury_draft "{\"_show_id\":\"$SHOW_ID\",\"_payload\":{\"selections\":[\"$COUNTRY_B\",\"$COUNTRY_C\"]},\"_expected_revision\":0}"
expect_failure "anonymous Jury draft save"
rpc_request "$USER_A_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$SHOW_ID\",\"_payload\":{\"selections\":[\"$COUNTRY_B\",\"$COUNTRY_C\"]},\"_expected_revision\":0,\"_device_id\":\"device-a\",\"_session_id\":\"session-a\"}"
expect_success "initial Jury draft save"
expect_json "initial draft accepted" ok true
expect_json "initial draft revision" server_revision 1
rpc_request "$USER_A_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$SHOW_ID\",\"_payload\":{\"selections\":[\"$COUNTRY_C\",\"$COUNTRY_B\"]},\"_expected_revision\":0}"
expect_success "stale Jury draft returns structured conflict"
expect_json "stale draft rejected" ok false
expect_json "stale draft conflict surfaced" conflict true
expect_json "stale draft canonical revision returned" server_revision 1
expect_json "stale draft canonical selection preserved" payload.selections.0 "$COUNTRY_B"
rpc_request "$USER_B_TOKEN" v3_load_jury_draft "{\"_show_id\":\"$SHOW_ID\"}"
expect_success "other delegation draft lookup remains non-enumerating"
expect_json "other delegation cannot see draft" found false

BALLOT="[{\"target_country_id\":\"$COUNTRY_B\",\"points\":12},{\"target_country_id\":\"$COUNTRY_C\",\"points\":10}]"
SUBMIT_BODY="{\"_show_id\":\"$SHOW_ID\",\"_entries\":$BALLOT,\"_preflight_id\":\"$PREFLIGHT_ID\",\"_operation_id\":\"$OPERATION_ID\",\"_request_hash\":\"caller-hash-is-not-authority\"}"

log "Submission commits once and returns an authoritative server receipt"
rpc_request "$USER_A_TOKEN" v3_submit_jury_ballot "$SUBMIT_BODY"
expect_success "initial Jury submission"
expect_json "submission accepted" ok true
expect_json "receipt authority" receipt.authority authoritative_server
expect_json "receipt operation" receipt.operation_id "$OPERATION_ID"
expect_json "initial submission is not replay" receipt.replayed false
RECEIPT_ID="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
BALLOT_ID="$(printf '%s' "$HTTP_BODY" | json_value receipt.ballot_submission_id)"
[[ -n "$RECEIPT_ID" && -n "$BALLOT_ID" ]] || fail "submission returned incomplete receipt evidence"

rpc_request "$USER_A_TOKEN" v3_submit_jury_ballot "$SUBMIT_BODY"
expect_success "exact Jury operation replay"
expect_json "replay keeps receipt" receipt.receipt_id "$RECEIPT_ID"
expect_json "replay keeps ballot" receipt.ballot_submission_id "$BALLOT_ID"
expect_json "replay is explicit" receipt.replayed true
[[ "$(db_scalar "select count(*) from private.v3_jury_operations where operation_id='$OPERATION_ID'::uuid;")" == "1" ]] || fail "operation replay duplicated the private ledger"
[[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$SHOW_ID'::uuid and voter_country_id='$COUNTRY_A'::uuid;")" == "1" ]] || fail "operation replay duplicated the canonical ballot"
[[ "$(db_scalar "select count(*) from private.v3_jury_drafts where show_id='$SHOW_ID'::uuid and user_id='$USER_A_ID'::uuid;")" == "0" ]] || fail "accepted ballot did not clear its canonical draft"

log "Reconciliation and receipt lookup remain owner-scoped"
rpc_request "$USER_A_TOKEN" v3_reconcile_jury_submission "{\"_operation_id\":\"$OPERATION_ID\"}"
expect_success "owner operation reconciliation"
expect_json "owner operation found" found true
expect_json "owner reconciliation receipt" receipt.receipt_id "$RECEIPT_ID"
rpc_request "$USER_B_TOKEN" v3_reconcile_jury_submission "{\"_operation_id\":\"$OPERATION_ID\"}"
expect_success "foreign reconciliation remains non-enumerating"
expect_json "foreign operation hidden" found false
rpc_request "$USER_A_TOKEN" v3_jury_receipt "{\"_show_id\":\"$SHOW_ID\"}"
expect_success "owner receipt reload"
expect_json "owner receipt found" found true
expect_json "owner receipt stable" receipt.receipt_id "$RECEIPT_ID"

log "Legacy canonical votes are acknowledged without fabricated receipts"
db_exec "insert into public.jury_votes(edition_id,show_id,voter_country_id,receiving_country_id,points) values ('$EDITION_ID','$SHOW_ID','$COUNTRY_B','$COUNTRY_C',12);"
rpc_request "$USER_B_TOKEN" v3_jury_receipt "{\"_show_id\":\"$SHOW_ID\"}"
expect_success "legacy Jury receipt lookup"
expect_json "legacy ballot recognized" submitted true
expect_json "legacy receipt remains unavailable" found false
expect_json "legacy status explicit" legacy true

log "PASS: V3 Jury hostile security rehearsal complete"
