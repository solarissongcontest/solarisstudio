#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-entry-credits] %s\n' "$*"; }
fail() { printf '\n[v3-entry-credits] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3EntryCredits2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
    -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json')
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

rpc() {
  local token="$1" name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$name" "$token" "$ANON_KEY" "$body"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

expect_failure() {
  local label="$1"
  (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded: $HTTP_BODY"
  log "PASS: $label rejected with HTTP $HTTP_STATUS"
}

json_value() {
  local path="$1"
  python3 -c '
import json,sys
v=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    v=v[int(key)] if isinstance(v,list) else v[key]
if v is None: print("")
elif isinstance(v,bool): print("true" if v else "false")
elif isinstance(v,(dict,list)): print(json.dumps(v,separators=(",",":"),sort_keys=True))
else: print(v)
' "$path"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

create_user() {
  local email="$1"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
  expect_success "create $email"
  printf '%s' "$HTTP_BODY" | json_value id
}

sign_in() {
  local email="$1"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
    "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}"
  expect_success "sign in $email"
  printf '%s' "$HTTP_BODY" | json_value access_token
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c648'
EDITION_ID='00000000-0000-4000-8000-00000000e648'
ROUND_ID='00000000-0000-4000-8000-00000000a648'
SESSION_ID='v3-entry-credits-session'
SUBMIT_ONE='00000000-0000-4000-8000-00000000b648'
SUBMIT_TWO='00000000-0000-4000-8000-00000000b649'
REVIEW_OP='00000000-0000-4000-8000-00000000b64a'

log "Creating participant and organizer identities"
PARTICIPANT_ID="$(create_user 'v3-entry-credits-participant@solaris.invalid' | tail -n1)"
ORGANIZER_ID="$(create_user 'v3-entry-credits-organizer@solaris.invalid' | tail -n1)"
PARTICIPANT_TOKEN="$(sign_in 'v3-entry-credits-participant@solaris.invalid' | tail -n1)"
ORGANIZER_TOKEN="$(sign_in 'v3-entry-credits-organizer@solaris.invalid' | tail -n1)"

log "Seeding one isolated Confirmation round"
db_exec "
insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','Creditsland','CRD');
insert into public.editions(id,name,year,slug,edition_number,status,published,editing_enabled)
values ('$EDITION_ID','Entry Credits Contract',2026,'entry-credits-contract',9648,'active',false,true);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','Credits round','open',now()-interval '1 hour',now()+interval '1 hour',true);
insert into public.country_accounts(user_id,country_id,status)
values ('$PARTICIPANT_ID','$COUNTRY_ID','active');
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
 ('$ORGANIZER_ID','confirmation.manage','$EDITION_ID'),
 ('$ORGANIZER_ID','delegation.manage',null);
"

BASE_PAYLOAD="{\"round_id\":\"$ROUND_ID\",\"browser_session_id\":\"$SESSION_ID\",\"instagram_username\":\"credits_fixture\",\"country\":\"Creditsland\",\"has_country_account\":true,\"country_account\":\"CRD\",\"participating\":true,\"selection_method\":\"internal\",\"entry_unknown\":false,\"nf_entries_unknown\":false,\"artist\":\"Canonical Artist\",\"song_title\":\"Canonical Song\",\"song_url\":\"https://example.invalid/canonical\",\"preview_start\":\"00:10\",\"preview_end\":\"00:40\",\"final_clip_start\":\"00:20\",\"final_clip_end\":\"00:50\",\"replacement_video_required\":false,\"replacement_video_url\":\"\",\"nf_name\":\"\",\"expected_entry_count\":\"\",\"nf_entries\":[],\"nf_date_type\":\"\",\"nf_exact_date\":\"\",\"nf_approximate_text\":\"\",\"nf_result_date_type\":\"\",\"nf_result_exact_date\":\"\",\"nf_result_approximate_text\":\"\",\"reveal_date_type\":\"\",\"reveal_exact_date\":\"\",\"reveal_approximate_text\":\"\"}"

log "Submitting a pre-Credits-compatible payload"
rpc "$ANON_KEY" v3_submit_confirmation \
  "{\"payload\":$BASE_PAYLOAD,\"_idempotency_key\":\"$SUBMIT_ONE\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$SESSION_ID\"}"
expect_success "initial canonical submit"
[[ "$(printf '%s' "$HTTP_BODY" | json_value ok)" == 'true' ]] || fail "initial submit did not return ok"
SUBMISSION_ID="$(printf '%s' "$HTTP_BODY" | json_value submission_id)"
ENTRY_ID="$(db_value "select id from public.internal_entries where submission_id='$SUBMISSION_ID';")"
VERSION_ONE="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"
[[ -n "$ENTRY_ID" && -n "$VERSION_ONE" ]] || fail "initial Entry/version missing"
[[ "$(db_value "select credits::text from public.internal_entries where id='$ENTRY_ID';")" == '[]' ]] || fail "legacy payload did not backfill empty credits"
[[ "$(db_value "select (content ? 'credits')::text from private.v3_entry_versions where id='$VERSION_ONE';")" == 'false' ]] || fail "empty backfill rewrote legacy immutable content shape"

log "Binding organizer review to version one"
rpc "$ORGANIZER_TOKEN" studio2_confirmation_entry_review_preview \
  "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\"}"
expect_success "review preview"
EXPECTED_REVIEW_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review \
  "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"accepted\",\"p_reason\":\"Credits baseline accepted\",\"p_operation_id\":\"$REVIEW_OP\",\"p_idempotency_key\":\"entry-credits-review\",\"p_expected_version\":$EXPECTED_REVIEW_VERSION,\"p_expected_entry_version\":\"$VERSION_ONE\"}"
expect_success "version-one review"
[[ "$(db_value "select reviewed_version_id::text from public.internal_entries where id='$ENTRY_ID';")" == "$VERSION_ONE" ]] || fail "review was not bound to version one"

log "Editing only Credits through the same canonical Confirmation writer"
db_exec "update public.submissions set editing_allowed=true where id='$SUBMISSION_ID';"
CREDIT_PAYLOAD="$(python3 - "$BASE_PAYLOAD" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
p['credits']=[
 {'role':'composer','name':'  Alice   Example '},
 {'role':'lyricist','name':'Bob Example'},
 {'role':'producer','name':'Carol Example'},
]
print(json.dumps(p,separators=(',',':')))
PY
)"
rpc "$ANON_KEY" v3_submit_confirmation \
  "{\"payload\":$CREDIT_PAYLOAD,\"_idempotency_key\":\"$SUBMIT_TWO\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$SESSION_ID\"}"
expect_success "Credits-only canonical edit"
[[ "$(printf '%s' "$HTTP_BODY" | json_value ok)" == 'true' ]] || fail "Credits edit did not return ok"
VERSION_TWO="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"
[[ "$VERSION_TWO" != "$VERSION_ONE" ]] || fail "Credits edit did not create a new immutable version"
[[ "$(db_value "select content_revision::text || ':' || review_status || ':' || (reviewed_version_id is null)::text from public.internal_entries where id='$ENTRY_ID';")" == '2:pending:true' ]] || fail "Credits edit retained stale review authority"
[[ "$(db_value "select (credits = '[{\"role\":\"composer\",\"name\":\"Alice Example\"},{\"role\":\"lyricist\",\"name\":\"Bob Example\"},{\"role\":\"producer\",\"name\":\"Carol Example\"}]'::jsonb)::text from public.internal_entries where id='$ENTRY_ID';")" == 'true' ]] || fail "Credits were not normalized canonically"
[[ "$(db_value "select ((content->'credits') = '[{\"role\":\"composer\",\"name\":\"Alice Example\"},{\"role\":\"lyricist\",\"name\":\"Bob Example\"},{\"role\":\"producer\",\"name\":\"Carol Example\"}]'::jsonb)::text from private.v3_entry_versions where id='$VERSION_TWO';")" == 'true' ]] || fail "immutable version did not capture Credits"

log "Exact retry is idempotent and does not amplify revisions"
rpc "$ANON_KEY" v3_submit_confirmation \
  "{\"payload\":$CREDIT_PAYLOAD,\"_idempotency_key\":\"$SUBMIT_TWO\",\"_request_hash\":\"different-caller-hash\",\"_browser_session_id\":\"$SESSION_ID\"}"
expect_success "Credits edit exact replay"
[[ "$(printf '%s' "$HTTP_BODY" | json_value receipt.replayed)" == 'true' ]] || fail "exact replay was not marked replayed"
[[ "$(db_value "select content_revision from public.internal_entries where id='$ENTRY_ID';")" == '2' ]] || fail "exact replay created another Entry revision"

TAMPERED_PAYLOAD="$(python3 - "$CREDIT_PAYLOAD" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); p['credits'][0]['name']='Different Composer'; print(json.dumps(p,separators=(',',':')))
PY
)"
rpc "$ANON_KEY" v3_submit_confirmation \
  "{\"payload\":$TAMPERED_PAYLOAD,\"_idempotency_key\":\"$SUBMIT_TWO\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$SESSION_ID\"}"
expect_failure "changed Credits with reused idempotency key"

log "Participant and immutable-history projections expose canonical Credits"
rpc "$PARTICIPANT_TOKEN" v3_confirmation_entry_credits \
  "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_success "participant current Credits projection"
[[ "$(printf '%s' "$HTTP_BODY" | json_value current_version_id)" == "$VERSION_TWO" ]] || fail "Credits projection returned stale version"
[[ "$(printf '%s' "$HTTP_BODY" | json_value credits.0.name)" == 'Alice Example' ]] || fail "Credits projection did not expose normalized current Credits"
rpc "$PARTICIPANT_TOKEN" v3_confirmation_entry_versions \
  "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\"}"
expect_success "participant immutable history after Credits edit"
[[ "$(printf '%s' "$HTTP_BODY" | json_value versions.0.content.credits.1.role)" == 'lyricist' ]] || fail "history lacks Credits diff evidence"
[[ "$(printf '%s' "$HTTP_BODY" | json_value versions.1.id)" == "$VERSION_ONE" ]] || fail "pre-Credits version disappeared"

log "Restore returns the historical empty Credits in the same organizer_restore version"
RESTORE_VERSION_ID="$(db_value "select id from public.submission_versions where submission_id='$SUBMISSION_ID' order by version desc limit 1;")"
[[ -n "$RESTORE_VERSION_ID" ]] || fail "Credits edit did not capture pre-edit submission snapshot"
RESTORE_REVISION="$(db_value "select private.v3_confirmation_response_delete_revision('$SUBMISSION_ID'::uuid);")"
rpc "$ORGANIZER_TOKEN" admin_restore_confirmation_version \
  "{\"_submission_id\":\"$SUBMISSION_ID\",\"_version_id\":\"$RESTORE_VERSION_ID\",\"_reason\":\"Restore pre-Credits snapshot\",\"p_expected_revision\":\"$RESTORE_REVISION\",\"p_operation_id\":\"29173012-0000-4000-8000-000000000101\",\"p_idempotency_key\":\"v3-credits-restore\"}"
expect_success "restore pre-Credits snapshot"
VERSION_THREE="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"
[[ "$VERSION_THREE" != "$VERSION_TWO" ]] || fail "restore did not create a fresh version identity"
[[ "$(db_value "select content_revision::text || ':' || credits::text || ':' || review_status from public.internal_entries where id='$ENTRY_ID';")" == '3:[]:pending' ]] || fail "restore did not restore empty Credits pending review"
[[ "$(db_value "select source || ':' || coalesce(restored_from_submission_version_id::text,'') from private.v3_entry_versions where id='$VERSION_THREE';")" == "organizer_restore:$RESTORE_VERSION_ID" ]] || fail "Credits restore lost immutable provenance"
[[ "$(db_value "select count(*) from private.v3_entry_versions where entry_id='$ENTRY_ID';")" == '3' ]] || fail "restore created an extra Credits-only revision"

log "Malformed/oversized Credits fail at the canonical DB boundary"
BAD_PAYLOAD="$(python3 - "$BASE_PAYLOAD" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); p['credits']=[{'role':'composer','name':f'Name {i}'} for i in range(33)]; print(json.dumps(p,separators=(',',':')))
PY
)"
rpc "$ANON_KEY" v3_submit_confirmation \
  "{\"payload\":$BAD_PAYLOAD,\"_idempotency_key\":\"00000000-0000-4000-8000-00000000b64b\",\"_request_hash\":\"ignored\",\"_browser_session_id\":\"$SESSION_ID\"}"
expect_failure "oversized Credits array"

log "System V3 P13 Entry Credits rehearsal passed"
