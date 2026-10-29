#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-security] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-security] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

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

db_exec() {
  local diagnostic
  diagnostic="$(mktemp)"
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>"$diagnostic"; then
    cat "$diagnostic" >&2
    printf '::error::%s\n' "$(sed -n '/ERROR:/p' "$diagnostic" | head -1)"
    rm -f "$diagnostic"
    exit 1
  fi
  rm -f "$diagnostic"
}
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
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,browser_session_id) values ('$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','me_receipt_fixture','V3 Security A','$SESSION_A');"

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
# Preserve an unbound legacy-row fixture without pretending it was accepted.
# S5 rejects successful operation receipts unless their canonical submission
# already exists in the same round.
db_exec "insert into private.v3_confirmation_operations(idempotency_key,request_hash,round_id,browser_session_id,result,receipt_id,accepted_at) values ('00000000-0000-4000-8000-00000000f528','me-unbound-operation','$ROUND_ID','me-unbound-fixture',jsonb_build_object('submission_id','00000000-0000-4000-8000-00000000f528'),'00000000-0000-4000-8000-00000000d528',now());"
rpc_request "$USER_A_TOKEN" v3_me_confirmation_summary '{}'
expect_success "unbound operation summary"
expect_json "operation without a canonical submission is not counted" receipt_count 1
rpc_request "$USER_A_TOKEN" v3_me_confirmation_summary '{}'
expect_success "own delegation summary"
expect_json "own delegation scope" country_id "$COUNTRY_A"
expect_json "own summary viewer" viewer_id "$USER_A_ID"
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

log "Entry versions preserve reviewed content and reject stale approval"
ENTRY_ID='00000000-0000-4000-8000-00000000f531'
NF_ID='00000000-0000-4000-8000-00000000f532'
NF_ENTRY_ID='00000000-0000-4000-8000-00000000f533'
db_exec "insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values ('$ENTRY_ID','$SUBMISSION_ID','Version artist','Original song','https://example.invalid/original');"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_B_ID','confirmation.manage','$EDITION_ID');"
rpc_request "$USER_A_TOKEN" v3_confirmation_entry_versions "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_success "own entry history"
expect_json "first immutable revision" versions.0.revision 1
expect_json "canonical source is not legacy approval" versions.0.source canonical_write
VERSION_ONE="$(printf '%s' "$HTTP_BODY" | json_value versions.0.id)"
rpc_request "$ANON_KEY" v3_confirmation_entry_versions "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_failure "anonymous entry history"
# B has a scoped review capability, but removing it must close cross-country reads.
db_exec "delete from public.studio2_capability_grants where user_id='$USER_B_ID' and capability='confirmation.manage';"
rpc_request "$USER_B_TOKEN" v3_confirmation_entry_versions "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_failure "other delegation entry history"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_B_ID','confirmation.manage','$EDITION_ID');"
rpc_request "$USER_B_TOKEN" studio2_confirmation_entry_review_preview "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\"}"
expect_success "versioned review preview"
expect_json "preview binds displayed content" currentVersionId "$VERSION_ONE"
EXPECTED_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
rpc_request "$USER_B_TOKEN" studio2_apply_confirmation_entry_review "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Reviewed original version\",\"p_operation_id\":\"00000000-0000-4000-8000-00000000f534\",\"p_idempotency_key\":\"v3-entry-rehearsal-review\",\"p_expected_version\":$EXPECTED_VERSION,\"p_expected_entry_version\":\"$VERSION_ONE\"}"
expect_success "canonical review operation"
[[ "$(db_scalar "select reviewed_version_id from public.internal_entries where id='$ENTRY_ID';")" == "$VERSION_ONE" ]] || fail "review not bound to exact original version"
[[ "$(db_scalar "select reviewed_version_id from public.submission_review_history where target_entry_id='$ENTRY_ID' order by created_at desc limit 1;")" == "$VERSION_ONE" ]] || fail "review history lost exact version"
expect_db_failure "entry snapshot cannot be rewritten" "update private.v3_entry_versions set content='{}' where id='$VERSION_ONE';"
expect_db_failure "entry review cannot be deleted" "delete from private.v3_entry_reviews where version_id='$VERSION_ONE';"
expect_db_failure "bound public audit cannot be rebound" "update public.submission_review_history set reviewed_version_id=null where target_entry_id='$ENTRY_ID';"
expect_db_failure "bound public audit cannot be deleted" "delete from public.submission_review_history where target_entry_id='$ENTRY_ID';"
expect_db_failure "browser reviewer cannot fabricate a bound audit event" "begin; set local role authenticated; select set_config('request.jwt.claims',jsonb_build_object('sub','$USER_B_ID','role','authenticated')::text,true); insert into public.submission_review_history(submission_id,target_type,target_entry_id,action,reason) values ('$SUBMISSION_ID','internal','$ENTRY_ID','declined','Fabricated browser audit'); rollback;"

expect_db_failure "authenticated cannot read private entry ledger" "set local role authenticated; select * from private.v3_entry_versions;"
db_exec "update public.internal_entries set song_title='Changed song',song_url='https://example.invalid/changed',current_version_id='$VERSION_ONE',reviewed_version_id='$VERSION_ONE',content_revision=900 where id='$ENTRY_ID';"
[[ "$(db_scalar "select review_status || ':' || content_revision || ':' || (reviewed_version_id is null)::text from public.internal_entries where id='$ENTRY_ID';")" == "pending:2:true" ]] || fail "edited entry retained old approval or forged revision"
rpc_request "$USER_A_TOKEN" v3_confirmation_entry_versions "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_success "history after content edit"
expect_json "new revision appended" versions.0.revision 2
expect_json "parent version preserved" versions.0.parent_version_id "$VERSION_ONE"
expect_json "original content preserved" versions.1.content.song_title "Original song"
expect_json "original review preserved" versions.1.reviews.0.decision accepted
CURRENT_REVIEW_VERSION="$(db_scalar "select version from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID';")"
rpc_request "$USER_B_TOKEN" studio2_apply_confirmation_entry_review "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Fresh revision but wrong displayed content\",\"p_operation_id\":\"00000000-0000-4000-8000-00000000f53a\",\"p_idempotency_key\":\"v3-unseen-entry-rehearsal\",\"p_expected_version\":$CURRENT_REVIEW_VERSION,\"p_expected_entry_version\":\"$VERSION_ONE\"}"
expect_failure "fresh CAS does not authorize approval of a different displayed version"
rpc_request "$USER_B_TOKEN" studio2_apply_confirmation_entry_review "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Missing displayed content\",\"p_operation_id\":\"00000000-0000-4000-8000-00000000f53a\",\"p_idempotency_key\":\"v3-unseen-entry-rehearsal\",\"p_expected_version\":$CURRENT_REVIEW_VERSION}"
expect_failure "older caller without displayed version cannot approve fresh content"


db_exec "update public.country_accounts set status='suspended' where user_id='$USER_A_ID';"
rpc_request "$USER_A_TOKEN" v3_confirmation_entry_versions "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_failure "suspended delegation cannot read Entry history"
db_exec "update public.country_accounts set status='active' where user_id='$USER_A_ID';"

rpc_request "$USER_B_TOKEN" studio2_apply_confirmation_entry_review "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Stale review\",\"p_operation_id\":\"00000000-0000-4000-8000-00000000f535\",\"p_idempotency_key\":\"v3-entry-rehearsal-stale\",\"p_expected_version\":$EXPECTED_VERSION,\"p_expected_entry_version\":\"$VERSION_ONE\"}"
expect_failure "old preview cannot approve edited content"
# A metadata-only update must neither create a version nor forge review evidence.
db_exec "update public.internal_entries set reviewed_version_id='$VERSION_ONE',current_version_id='$VERSION_ONE',content_revision=999 where id='$ENTRY_ID';"
[[ "$(db_scalar "select content_revision || ':' || (reviewed_version_id is null)::text from public.internal_entries where id='$ENTRY_ID';")" == "2:true" ]] || fail "client replaced authoritative version pointers"
# Restoring old content still appends a new version and needs another review.
db_exec "update public.internal_entries set song_title='Original song',song_url='https://example.invalid/original' where id='$ENTRY_ID';"
[[ "$(db_scalar "select content_revision || ':' || review_status from public.internal_entries where id='$ENTRY_ID';")" == "3:pending" ]] || fail "restored content reused old approval"
db_exec "insert into public.internal_entries(submission_id,artist,song_title,song_url) values ('$SUBMISSION_ID','Version artist','Upsert content','https://example.invalid/upsert') on conflict(submission_id) do update set song_title=excluded.song_title,song_url=excluded.song_url;"
[[ "$(db_scalar "select content_revision from public.internal_entries where id='$ENTRY_ID';")" == "4" ]] || fail "UPSERT did not advance the real entry"
[[ "$(db_scalar "select count(*) from private.v3_entry_versions where submission_id='$SUBMISSION_ID' and target_type='internal' and entry_id<>'$ENTRY_ID';")" == "0" ]] || fail "UPSERT created evidence for a discarded insert candidate"

db_exec "insert into public.national_finals(id,submission_id,nf_name,country_id,edition_id) values ('$NF_ID','$SUBMISSION_ID','Version final','$COUNTRY_A','$EDITION_ID');"
db_exec "insert into public.national_final_entries(id,national_final_id,artist,song_title,review_status) values ('$NF_ENTRY_ID','$NF_ID','Final artist','Final song','accepted');"
expect_db_failure "unbound accepted status is not winner evidence" "update public.national_finals set winning_entry_id='$NF_ENTRY_ID' where id='$NF_ID';"
# Trusted fixture review uses the same row trigger as the canonical reviewed update.
db_exec "update public.national_final_entries set reviewed_at=clock_timestamp(),reviewed_by='$USER_B_ID' where id='$NF_ENTRY_ID';"
db_exec "update public.national_finals set winning_entry_id='$NF_ENTRY_ID' where id='$NF_ID';"
# Capture a real older delegation snapshot with an accepted, selected winner.
db_exec "insert into public.submission_versions(id,submission_id,version,snapshot) select '00000000-0000-4000-8000-00000000f539',s.id,1,jsonb_build_object('submission',to_jsonb(s)||jsonb_build_object('selection_method','national_final'),'national_final',to_jsonb(nf),'nf_entries',(select jsonb_agg(to_jsonb(i)) from public.national_final_entries i where i.national_final_id=nf.id)) from public.submissions s join public.national_finals nf on nf.submission_id=s.id where s.id='$SUBMISSION_ID';"
expect_db_failure "selected winner content cannot change" "update public.national_final_entries set song_title='Unreviewed winner' where id='$NF_ENTRY_ID';"
db_exec "update public.national_finals set winning_entry_id=null where id='$NF_ID'; update public.national_final_entries set song_title='Unreviewed winner' where id='$NF_ENTRY_ID';"
expect_db_failure "old winner review cannot select edited version" "update public.national_finals set winning_entry_id='$NF_ENTRY_ID' where id='$NF_ID';"
db_exec "begin transaction read only; set local role authenticated; select set_config('request.jwt.claims',jsonb_build_object('sub','$USER_A_ID','role','authenticated')::text,true); select public.v3_confirmation_entry_versions('internal','$ENTRY_ID'); rollback;"
db_exec "insert into public.editions(id,name,slug,edition_number,status,published) values ('00000000-0000-4000-8000-00000000f538','Other Entry edition','other-entry-edition',9538,'draft',false);"
expect_db_failure "versioned submission cannot move editions" "update public.submissions set edition_id='00000000-0000-4000-8000-00000000f538' where id='$SUBMISSION_ID';"
expect_db_failure "versioned National Final cannot become unowned" "update public.national_finals set submission_id=null where id='$NF_ID';"
db_exec "insert into public.national_finals(id,nf_name,country_id,edition_id) values ('00000000-0000-4000-8000-00000000f536','Historical unowned final','$COUNTRY_A','$EDITION_ID');"
expect_db_failure "versioned candidate cannot escape into historical workflow" "update public.national_final_entries set national_final_id='00000000-0000-4000-8000-00000000f536' where id='$NF_ENTRY_ID';"
# Unowned historical finals still permit their existing accepted/winner workflow.
db_exec "insert into public.national_final_entries(id,national_final_id,artist,song_title,review_status) values ('00000000-0000-4000-8000-00000000f537','00000000-0000-4000-8000-00000000f536','Historical artist','Historical song','accepted'); update public.national_finals set winning_entry_id='00000000-0000-4000-8000-00000000f537' where id='00000000-0000-4000-8000-00000000f536';"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_B_ID','delegation.manage',null);"
RESTORE_REVISION="$(db_scalar "select private.v3_confirmation_response_delete_revision('$SUBMISSION_ID'::uuid);")"
rpc_request "$USER_B_TOKEN" admin_restore_confirmation_version "{\"_submission_id\":\"$SUBMISSION_ID\",\"_version_id\":\"00000000-0000-4000-8000-00000000f539\",\"_reason\":\"Restore reviewed winner content for a new review\",\"p_expected_revision\":\"$RESTORE_REVISION\",\"p_operation_id\":\"29173011-0000-4000-8000-000000000101\",\"p_idempotency_key\":\"v3-restore-rehearsal-1\"}"
expect_success "restore a National Final snapshot with a historical winner"
expect_json "restored winner explicitly requires review" winner_requires_review true
[[ "$(db_scalar "select winning_entry_id is null from public.national_finals where id='$NF_ID';")" == "t" ]] || fail "restore reused winner approval"
[[ "$(db_scalar "select count(*) from public.national_final_entries where national_final_id='$NF_ID' and song_title='Final song' and review_status='pending' and reviewed_version_id is null and current_version_id is not null;")" == "1" ]] || fail "restore did not produce pending versioned content"
RESTORE_REVISION="$(db_scalar "select private.v3_confirmation_response_delete_revision('$SUBMISSION_ID'::uuid);")"
rpc_request "$USER_B_TOKEN" admin_restore_confirmation_version "{\"_submission_id\":\"$SUBMISSION_ID\",\"_version_id\":\"00000000-0000-4000-8000-00000000f539\",\"_reason\":\"Restore the same content as another new version\",\"p_expected_revision\":\"$RESTORE_REVISION\",\"p_operation_id\":\"29173011-0000-4000-8000-000000000102\",\"p_idempotency_key\":\"v3-restore-rehearsal-2\"}"
expect_success "same-content restore still creates a new content identity"
[[ "$(db_scalar "select content_revision from public.national_final_entries where national_final_id='$NF_ID' and song_title='Final song';")" == "2" ]] || fail "same-content restore reused an old version identity"
# Historical restoration must still respect later moderation removal.
db_exec "update public.national_final_entries set review_status='removed',removed=true,reviewed_at=clock_timestamp(),reviewed_by='$USER_B_ID' where national_final_id='$NF_ID' and song_title='Final song';"
RESTORE_REVISION="$(db_scalar "select private.v3_confirmation_response_delete_revision('$SUBMISSION_ID'::uuid);")"
rpc_request "$USER_B_TOKEN" admin_restore_confirmation_version "{\"_submission_id\":\"$SUBMISSION_ID\",\"_version_id\":\"00000000-0000-4000-8000-00000000f539\",\"_reason\":\"Must not resurrect a removed candidate\",\"p_expected_revision\":\"$RESTORE_REVISION\",\"p_operation_id\":\"29173011-0000-4000-8000-000000000103\",\"p_idempotency_key\":\"v3-restore-rehearsal-3\"}"
expect_failure "restore cannot bypass later moderation removal"
[[ "$(db_scalar "select count(*) from public.national_final_entries where national_final_id='$NF_ID' and removed;")" == "1" ]] || fail "restore resurrected a removed candidate"
# Canonical response deletion must remain possible without deleting private evidence.
db_exec "delete from public.submissions where id='$SUBMISSION_ID';"
[[ "$(db_scalar "select count(*) > 0 from private.v3_entry_versions where submission_id='$SUBMISSION_ID';")" == "t" ]] || fail "canonical deletion rewrote immutable evidence"
log "PASS: immutable Entry versions, exact reviews, stale preview and winner protection"
