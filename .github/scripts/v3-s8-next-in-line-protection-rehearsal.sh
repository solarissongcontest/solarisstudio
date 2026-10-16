#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s8-next-in-line] %s\n' "$*"; }
fail() { printf '\n[v3-s8-next-in-line] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

HTTP_STATUS=''
HTTP_BODY=''
rpc() {
  local body="$1" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X POST \
    "$API_URL/rest/v1/rpc/submit_next_in_line" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H 'Content-Type: application/json' \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
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
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
else: print(value)
' "$path"
}

EDITION_ID='00000000-0000-4000-8000-00000000e881'
ROUND_ID='00000000-0000-4000-8000-00000000a881'
SOURCE_ID='00000000-0000-4000-8000-00000000b881'
COUNTRY_ID='00000000-0000-4000-8000-00000000c881'
INTERNAL_ID='00000000-0000-4000-8000-00000000d881'

log "Seeding one eligible source submission and an open canonical window"
db_exec "
insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S8 Next Country','S8N');
insert into public.editions(id,name,slug,edition_number,status,published) values ('$EDITION_ID','S8 Next in Line','s8-next-in-line',9881,'active',false);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at) values ('$ROUND_ID','$EDITION_ID','S8 Next Round','open',now()-interval '1 hour',now()+interval '1 hour');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method,reviewed) values ('$SOURCE_ID','$EDITION_ID','$ROUND_ID','s8next','S8 Next Country',true,'internal',true);
insert into public.internal_entries(id,submission_id,artist,song_title,song_url,preview_start,preview_end,review_status) values ('$INTERNAL_ID','$SOURCE_ID','Winning Artist','Winning Song','https://example.invalid/winner','00:10','00:20','accepted');
insert into public.studio2_next_in_line_windows(edition_id,enabled,status,opens_at,closes_at,version,reason) values ('$EDITION_ID',true,'open',now()-interval '1 minute',now()+interval '1 hour',1,'S8 resource rehearsal');
"

BASE_PAYLOAD="{\"payload\":{\"edition_id\":\"$EDITION_ID\",\"source_submission_id\":\"$SOURCE_ID\",\"country\":\"S8 Next Country\",\"participating\":true,\"entry_unknown\":false,\"selection_type\":\"internal\",\"national_final_entry_id\":null,\"artist\":\"Alternative Artist\",\"song_title\":\"Alternative Song\",\"song_url\":\"https://example.invalid/alternative\",\"preview_start\":\"00:30\",\"preview_end\":\"00:40\"}}"

log "Initial submission creates one canonical row"
rpc "$BASE_PAYLOAD"
expect_success "initial Next in Line submission"
[[ "$(printf '%s' "$HTTP_BODY" | json_value replayed)" == 'false' ]] || fail "initial submission was incorrectly marked replayed: $HTTP_BODY"
SUBMISSION_ID="$(printf '%s' "$HTTP_BODY" | json_value submission_id)"
FIRST_SUBMITTED_AT="$(db_value "select submitted_at::text from public.next_in_line_submissions where id='$SUBMISSION_ID';")"
[[ "$(db_value "select count(*) from public.next_in_line_submissions where edition_id='$EDITION_ID' and source_submission_id='$SOURCE_ID';")" == '1' ]] || fail "initial submission did not create exactly one canonical row"

log "Exact network retry is a no-op replay"
sleep 0.05
rpc "$BASE_PAYLOAD"
expect_success "exact replay"
[[ "$(printf '%s' "$HTTP_BODY" | json_value replayed)" == 'true' ]] || fail "exact retry was not reported as replay: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value submission_id)" == "$SUBMISSION_ID" ]] || fail "replay changed durable submission identity"
[[ "$(db_value "select submitted_at::text from public.next_in_line_submissions where id='$SUBMISSION_ID';")" == "$FIRST_SUBMITTED_AT" ]] || fail "replay rewrote submitted_at"

log "Changed semantic request intentionally updates the same canonical row"
CHANGED_PAYLOAD="${BASE_PAYLOAD/Alternative Song/Alternative Song Revised}"
rpc "$CHANGED_PAYLOAD"
expect_success "changed semantic resubmission"
[[ "$(printf '%s' "$HTTP_BODY" | json_value replayed)" == 'false' ]] || fail "changed request was incorrectly treated as replay"
[[ "$(printf '%s' "$HTTP_BODY" | json_value submission_id)" == "$SUBMISSION_ID" ]] || fail "changed request created a second durable identity"
[[ "$(db_value "select song_title from public.next_in_line_submissions where id='$SUBMISSION_ID';")" == 'Alternative Song Revised' ]] || fail "changed semantic request did not update canonical row"

log "Unsupported keys and over-limit fields are rejected before mutation"
UNKNOWN_PAYLOAD="${BASE_PAYLOAD/\"preview_end\":\"00:40\"/\"preview_end\":\"00:40\",\"padding\":\"not-allowed\"}"
rpc "$UNKNOWN_PAYLOAD"
expect_failure "unknown payload key"
LONG_ARTIST="$(python3 -c 'print("A"*161)')"
OVERSIZE_PAYLOAD="${BASE_PAYLOAD/Alternative Artist/$LONG_ARTIST}"
rpc "$OVERSIZE_PAYLOAD"
expect_failure "artist over client/server ceiling"
[[ "$(db_value "select count(*) from public.next_in_line_submissions where edition_id='$EDITION_ID' and source_submission_id='$SOURCE_ID';")" == '1' ]] || fail "rejected payload changed row cardinality"

log "Database constraints protect internal/direct writers too"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "update public.next_in_line_submissions set song_url=repeat('x',501) where id='$SUBMISSION_ID';" >/tmp/v3-s8-next-direct 2>&1; then
  cat /tmp/v3-s8-next-direct >&2
  rm -f /tmp/v3-s8-next-direct
  fail "direct over-limit update unexpectedly succeeded"
fi
rm -f /tmp/v3-s8-next-direct
log "PASS: direct over-limit update rejected"

log "Concurrent first-write retries collapse to one canonical row"
db_exec "delete from public.next_in_line_submissions where id='$SUBMISSION_ID';"
outputs="$(mktemp -d)"
pids=()
for attempt in $(seq 1 8); do
  (
    curl -sS -o "$outputs/body-$attempt" -w '%{http_code}' -X POST \
      "$API_URL/rest/v1/rpc/submit_next_in_line" \
      -H "apikey: $ANON_KEY" \
      -H "Authorization: Bearer $ANON_KEY" \
      -H 'Content-Type: application/json' \
      --data "$BASE_PAYLOAD" > "$outputs/status-$attempt"
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || fail "concurrent request process failed"; done
for attempt in $(seq 1 8); do
  status="$(cat "$outputs/status-$attempt")"
  (( status >= 200 && status < 300 )) || fail "concurrent request $attempt returned HTTP $status: $(cat "$outputs/body-$attempt")"
done
rm -rf "$outputs"
[[ "$(db_value "select count(*) from public.next_in_line_submissions where edition_id='$EDITION_ID' and source_submission_id='$SOURCE_ID';")" == '1' ]] || fail "concurrent retries created duplicate canonical rows"

[[ "$(db_value "select count(*) from pg_indexes where schemaname='public' and indexname='next_in_line_submissions_edition_source_v3_uidx';")" == '1' ]] || fail "canonical edition/source unique index missing"
[[ "$(db_value "select count(*) from pg_constraint where conrelid='public.next_in_line_submissions'::regclass and conname like 'next_in_line_submissions_%_length_v3_check' and convalidated;")" == '6' ]] || fail "Next in Line resource constraints are not all validated"

log "System V3 S8 Next in Line protection rehearsal passed"
