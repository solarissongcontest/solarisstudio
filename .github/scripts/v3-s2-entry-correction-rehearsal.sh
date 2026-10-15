#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s2-entry-correction] %s\n' "$*"; }
fail() { printf '\n[v3-s2-entry-correction] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal creates destructive fixtures. It is permitted only against the
# disposable local Supabase stack and must never fall back to hosted Supabase.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S2EntryCorrection2026!'
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
  log "PASS: $1"
}
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
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

COUNTRY_ID='00000000-0000-4000-8000-00000000c801'
EDITION_ID='00000000-0000-4000-8000-00000000e801'
ROUND_ID='00000000-0000-4000-8000-00000000a801'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f801'
ENTRY_ID='00000000-0000-4000-8000-00000000d801'
OPERATION_ID='00000000-0000-4000-8000-00000000b801'
RETRY_OPERATION_ID='00000000-0000-4000-8000-00000000b802'
CONFLICT_OPERATION_ID='00000000-0000-4000-8000-00000000b803'
CORRELATION_ID='00000000-0000-4000-8000-00000000c802'
IDEMPOTENCY_KEY='v3-s2-entry-correction-key'

log "Creating isolated Organizer and participant identities"
create_user v3-s2-entry-organizer@solaris.invalid; ORGANIZER_ID="$LAST_USER_ID"
create_user v3-s2-entry-participant@solaris.invalid; PARTICIPANT_ID="$LAST_USER_ID"
sign_in v3-s2-entry-organizer@solaris.invalid; ORGANIZER_TOKEN="$LAST_TOKEN"
sign_in v3-s2-entry-participant@solaris.invalid; PARTICIPANT_TOKEN="$LAST_TOKEN"

log "Seeding one authoritative current Entry revision"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S2 Entry Country','S2E');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S2 Entry Correction',2026,'s2-entry-correction',9801,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','S2 correction round','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.country_accounts(user_id,country_id,status) values ('$PARTICIPANT_ID','$COUNTRY_ID','active');"
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,has_country_account,country_account,participating,selection_method,editing_allowed,browser_session_id) values ('$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','s2entry','S2 Entry Country',true,'S2E',true,'internal',true,'s2-entry-session');"
db_exec "insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values ('$ENTRY_ID','$SUBMISSION_ID','Original artist','Original song','https://example.invalid/original');"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$ORGANIZER_ID','confirmation.manage','$EDITION_ID');"
ENTRY_VERSION="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"

rpc "$ORGANIZER_TOKEN" studio2_confirmation_entry_review_preview "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"declined\"}"
expect_success "Entry correction preflight"
EXPECTED_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
[[ "$(printf '%s' "$HTTP_BODY" | json_value currentVersionId)" == "$ENTRY_VERSION" ]] || fail "preflight was not bound to the displayed Entry revision"

REQUEST_BODY="{\"p_target_type\":\"internal\",\"p_entry_id\":\"$ENTRY_ID\",\"p_target_status\":\"declined\",\"p_reason\":\"Correct the artist credit\",\"p_operation_id\":\"$OPERATION_ID\",\"p_idempotency_key\":\"$IDEMPOTENCY_KEY\",\"p_expected_version\":$EXPECTED_VERSION,\"p_expected_entry_version\":\"$ENTRY_VERSION\",\"p_correlation_id\":\"$CORRELATION_ID\"}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$REQUEST_BODY"
expect_success "canonical entry.request_changes command"
expect_json "new receipt status" status succeeded
expect_json "new receipt command" command entry.request_changes
expect_json "new receipt correlation" correlationId "$CORRELATION_ID"
expect_json "new receipt result" result.reviewState changes_requested
expect_json "new receipt replay marker" replayed false

[[ "$(db_value "select review_status from public.internal_entries where id='$ENTRY_ID';")" == 'declined' ]] || fail "authoritative Entry did not enter correction state"
[[ "$(db_value "select count(*) from public.submission_review_history where target_entry_id='$ENTRY_ID' and action='declined';")" == '1' ]] || fail "correction audit history was not written exactly once"
[[ "$(db_value "select command || ':' || correlation_id::text || ':' || status from public.studio2_operation_receipts where operation_id='$OPERATION_ID';")" == "entry.request_changes:$CORRELATION_ID:succeeded" ]] || fail "canonical operation receipt was not durable"

log "Replaying the exact semantic request after CAS advanced"
REPLAY_BODY="${REQUEST_BODY/\"$OPERATION_ID\"/\"$RETRY_OPERATION_ID\"}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$REPLAY_BODY"
expect_success "same-key same-request replay"
expect_json "replay returns original operation" operationId "$OPERATION_ID"
expect_json "replay marker" replayed true
[[ "$(db_value "select count(*) from public.submission_review_history where target_entry_id='$ENTRY_ID' and action='declined';")" == '1' ]] || fail "replay duplicated the authoritative mutation"

log "Rejecting the same key with changed semantics"
CONFLICT_BODY="${REQUEST_BODY/\"$OPERATION_ID\"/\"$CONFLICT_OPERATION_ID\"}"
CONFLICT_BODY="${CONFLICT_BODY/Correct the artist credit/Replace the song}"
rpc "$ORGANIZER_TOKEN" studio2_apply_confirmation_entry_review "$CONFLICT_BODY"
expect_failure "same-key changed-request conflict"
[[ "$HTTP_BODY" == *"IDEMPOTENCY_CONFLICT"* ]] || fail "changed request did not expose the canonical conflict code: $HTTP_BODY"

rpc "$ORGANIZER_TOKEN" studio2_reconcile_operation "{\"p_operation_id\":\"$OPERATION_ID\"}"
expect_success "lost-response reconciliation"
expect_json "reconciled status" status succeeded
expect_json "reconciled correction state" result.reviewState changes_requested

rpc "$PARTICIPANT_TOKEN" studio2_apply_confirmation_entry_review "$REQUEST_BODY"
expect_failure "participant cannot execute Organizer correction command"

log "Participant resubmission creates a new revision and clears the correction state"
db_exec "update public.internal_entries set artist='Corrected artist' where id='$ENTRY_ID';"
[[ "$(db_value "select review_status || ':' || content_revision || ':' || (reviewed_version_id is null)::text from public.internal_entries where id='$ENTRY_ID';")" == 'pending:2:true' ]] || fail "resubmission did not clear the correction state onto a new revision"

log "System V3 S2 Entry correction rehearsal passed"
