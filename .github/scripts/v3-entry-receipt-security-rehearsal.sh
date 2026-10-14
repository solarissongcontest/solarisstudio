#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-entry-receipt] %s\n' "$*"; }
fail() { printf '\n[v3-entry-receipt] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This is destructive fixture traffic and is permitted only against the local
# disposable Supabase stack. Never relax this guard to make CI convenient.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3EntryReceiptSecurity2026!'
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
  local token="$1" body="$2"
  request POST "$API_URL/rest/v1/rpc/v3_country_account_entry_receipt" "$token" "$ANON_KEY" "$body"
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

COUNTRY_A='00000000-0000-4000-8000-00000000c601'
COUNTRY_B='00000000-0000-4000-8000-00000000c602'
EDITION_ID='00000000-0000-4000-8000-00000000e601'
ROUND_ID='00000000-0000-4000-8000-00000000a601'
SUBMISSION_WITH_RECEIPT='00000000-0000-4000-8000-00000000f601'
LEGACY_SUBMISSION='00000000-0000-4000-8000-00000000f602'
OPERATION_ID='00000000-0000-4000-8000-00000000b601'
RECEIPT_ID='00000000-0000-4000-8000-00000000d601'

log "Creating isolated country-account identities"
create_user v3-entry-receipt-a@solaris.invalid; USER_A_ID="$LAST_USER_ID"
create_user v3-entry-receipt-b@solaris.invalid; USER_B_ID="$LAST_USER_ID"
sign_in v3-entry-receipt-a@solaris.invalid; USER_A_TOKEN="$LAST_TOKEN"
sign_in v3-entry-receipt-b@solaris.invalid; USER_B_TOKEN="$LAST_TOKEN"

log "Seeding canonical submissions and one private authoritative operation"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_A','Entry Receipt A','ERA'),('$COUNTRY_B','Entry Receipt B','ERB');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','V3 Entry Receipt Security',2026,'v3-entry-receipt-security',9601,'active',true);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','Entry receipt round','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.country_accounts(user_id,country_id,status) values ('$USER_A_ID','$COUNTRY_A','active'),('$USER_B_ID','$COUNTRY_B','active');"
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,has_country_account,country_account,participating,selection_method,editing_allowed,browser_session_id) values ('$SUBMISSION_WITH_RECEIPT','$EDITION_ID','$ROUND_ID','entryreceipt','Entry Receipt A',true,'ERA',true,'internal',true,'entry-receipt-session'),('$LEGACY_SUBMISSION','$EDITION_ID','$ROUND_ID','entryreceiptlegacy','ERA',true,'ERA',true,'internal',true,'entry-receipt-legacy');"
db_exec "insert into private.v3_confirmation_operations(idempotency_key,request_hash,round_id,browser_session_id,result,receipt_id,accepted_at) values ('$OPERATION_ID',repeat('a',64),'$ROUND_ID','entry-receipt-session',jsonb_build_object('ok',true,'submission_id','$SUBMISSION_WITH_RECEIPT'),'$RECEIPT_ID',now());"

log "Anonymous callers cannot use the authenticated Entry receipt projection"
rpc_request "$ANON_KEY" "{\"p_submission_id\":\"$SUBMISSION_WITH_RECEIPT\"}"
expect_failure "anonymous Entry receipt lookup"

log "The owning country account can read only its authoritative receipt subset"
rpc_request "$USER_A_TOKEN" "{\"p_submission_id\":\"$SUBMISSION_WITH_RECEIPT\"}"
expect_success "owner Entry receipt lookup"
expect_json "owner receipt found" found true
expect_json "owner receipt id" receipt.receipt_id "$RECEIPT_ID"
expect_json "owner receipt authority" receipt.authority authoritative_server
expect_json "owner receipt round" receipt.round_id "$ROUND_ID"

log "A different country account cannot enumerate another delegation's receipt"
rpc_request "$USER_B_TOKEN" "{\"p_submission_id\":\"$SUBMISSION_WITH_RECEIPT\"}"
expect_success "foreign Entry receipt lookup remains non-enumerating"
expect_json "foreign receipt hidden" found false

log "Canonical legacy submissions never receive fabricated V3 receipt evidence"
rpc_request "$USER_A_TOKEN" "{\"p_submission_id\":\"$LEGACY_SUBMISSION\"}"
expect_success "legacy Entry receipt lookup"
expect_json "legacy receipt remains unavailable" found false

log "V3 Entry receipt security rehearsal passed"
