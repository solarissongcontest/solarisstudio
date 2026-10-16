#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s7-entry-auth] %s\n' "$*"; }
fail() { printf '\n[v3-s7-entry-auth] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

PASSWORD='V3S7ObjectAuth2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1"
  local url="$2"
  local bearer="$3"
  local api_key="$4"
  local data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key"
    -H "Authorization: Bearer $bearer"
    -H "Content-Type: application/json")
  if [[ -n "$data" ]]; then args+=(--data "$data"); fi
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

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value = value[int(key)] if isinstance(value, list) else value[key]
print("" if value is None else value)
' "$path"
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

rpc() {
  local token="$1"
  local function_name="$2"
  local body="$3"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$token" "$ANON_KEY" "$body"
}

log "Creating isolated scoped organizer identity"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"v3-s7-entry-organizer@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create scoped organizer"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
[[ -n "$USER_ID" ]] || fail "Auth admin response had no user id"

request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"v3-s7-entry-organizer@solaris.invalid\",\"password\":\"$PASSWORD\"}"
expect_success "sign in scoped organizer"
USER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
[[ -n "$USER_TOKEN" ]] || fail "Sign-in response had no access token"

EDITION_A='00000000-0000-4000-8000-00000000a701'
EDITION_B='00000000-0000-4000-8000-00000000b701'
COUNTRY_ID='00000000-0000-4000-8000-00000000c701'
OTHER_COUNTRY_ID='00000000-0000-4000-8000-00000000c702'
PARTICIPANT_B='00000000-0000-4000-8000-00000000b711'

log "Seeding two editions and one Edition-B entry"
db_exec "
insert into public.editions(id,name,slug,edition_number,status,published)
values
  ('$EDITION_A','S7 Edition A','v3-s7-edition-a',9701,'draft',false),
  ('$EDITION_B','S7 Edition B','v3-s7-edition-b',9702,'draft',false);
insert into public.countries(id,name,short_code)
values
  ('$COUNTRY_ID','S7 Country','S7A'),
  ('$OTHER_COUNTRY_ID','S7 Other Country','S7B');
insert into public.participants(id,edition_id,country_id,artist,song,notes,semi_final)
values ('$PARTICIPANT_B','$EDITION_B','$COUNTRY_ID','Original Artist','Original Song','Original Notes','final');
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID'::uuid,'entry.edit','$EDITION_A'::uuid);
"

assert_db_eq "fixture participant belongs to Edition B" \
  "select edition_id::text from public.participants where id='$PARTICIPANT_B';" "$EDITION_B"
assert_db_eq "organizer has entry.edit only in Edition A" \
  "select count(*) from public.studio2_capability_grants where user_id='$USER_ID'::uuid and capability='entry.edit' and edition_id='$EDITION_A'::uuid;" "1"
assert_db_eq "organizer has no Edition B grant" \
  "select count(*) from public.studio2_capability_grants where user_id='$USER_ID'::uuid and capability='entry.edit' and edition_id='$EDITION_B'::uuid;" "0"

log "Hostile BOLA attempt: authorize Edition A but target Edition B participant"
rpc "$USER_TOKEN" admin_upsert_country_entry \
  "{\"_country_id\":\"$COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_A\",\"_show_id\":null,\"_artist\":\"Cross Edition Artist\",\"_song\":\"Cross Edition Song\",\"_notes\":\"must never persist\"}"
expect_failure "cross-edition entry upsert"
assert_db_eq "denied upsert preserves Edition B artist" \
  "select artist from public.participants where id='$PARTICIPANT_B';" "Original Artist"
assert_db_eq "denied upsert preserves Edition B song" \
  "select song from public.participants where id='$PARTICIPANT_B';" "Original Song"

rpc "$USER_TOKEN" admin_update_country_entry_listen_links \
  "{\"_country_id\":\"$COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_A\",\"_youtube_url\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\",\"_spotify_url\":null,\"_apple_music_url\":null}"
expect_failure "cross-edition listen-link update"
assert_db_eq "denied listen-link update preserves Edition B" \
  "select coalesce(youtube_url,'') from public.participants where id='$PARTICIPANT_B';" ""

log "Correct object id still requires capability for the authoritative Edition B scope"
rpc "$USER_TOKEN" admin_upsert_country_entry \
  "{\"_country_id\":\"$COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_B\",\"_show_id\":null,\"_artist\":\"No Grant Artist\",\"_song\":\"No Grant Song\",\"_notes\":null}"
expect_failure "Edition B object without Edition B capability"
assert_db_eq "missing capability preserves Edition B entry" \
  "select artist from public.participants where id='$PARTICIPANT_B';" "Original Artist"

log "Wrong-country object binding is rejected even after scope capability exists"
db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_ID'::uuid,'entry.edit','$EDITION_B'::uuid);"
rpc "$USER_TOKEN" admin_upsert_country_entry \
  "{\"_country_id\":\"$OTHER_COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_B\",\"_show_id\":null,\"_artist\":\"Wrong Country Artist\",\"_song\":\"Wrong Country Song\",\"_notes\":null}"
expect_failure "participant cannot be rebound through a different country id"
assert_db_eq "wrong-country attempt preserves canonical country" \
  "select country_id::text from public.participants where id='$PARTICIPANT_B';" "$COUNTRY_ID"

log "Matching object scope plus matching capability succeeds"
rpc "$USER_TOKEN" admin_upsert_country_entry \
  "{\"_country_id\":\"$COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_B\",\"_show_id\":null,\"_artist\":\"Authorized Artist\",\"_song\":\"Authorized Song\",\"_notes\":\"authorized\"}"
expect_success "Edition B upsert with Edition B capability"
assert_db_eq "authorized upsert changes Edition B artist" \
  "select artist from public.participants where id='$PARTICIPANT_B';" "Authorized Artist"

rpc "$USER_TOKEN" admin_update_country_entry_listen_links \
  "{\"_country_id\":\"$COUNTRY_ID\",\"_participant_id\":\"$PARTICIPANT_B\",\"_edition_id\":\"$EDITION_B\",\"_youtube_url\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\",\"_spotify_url\":null,\"_apple_music_url\":null}"
expect_success "Edition B listen-link update with Edition B capability"
assert_db_eq "authorized listen-link update persists" \
  "select youtube_url from public.participants where id='$PARTICIPANT_B';" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

log "All V3 S7 country-entry object authorization checks passed"
