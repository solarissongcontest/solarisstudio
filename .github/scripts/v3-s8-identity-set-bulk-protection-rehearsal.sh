#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s8-identity-sets] %s\n' "$*"; }
fail() { printf '\n[v3-s8-identity-sets] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S8IdentitySets2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json')
  if [[ -n "$data" ]]; then args+=(--data "$data"); fi
  HTTP_STATUS="$(curl "${args[@]}")"
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
v=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    v=v[int(key)] if isinstance(v,list) else v[key]
print("" if v is None else v)
' "$path"
}
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
rpc() {
  local token="$1" name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$name" "$token" "$ANON_KEY" "$body"
}

log "Creating scoped operator"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"v3-s8-identity-sets@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create operator"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"v3-s8-identity-sets@solaris.invalid\",\"password\":\"$PASSWORD\"}"
expect_success "sign in operator"
USER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"

EDITION_ID='00000000-0000-4000-8000-00000000e8a1'
COUNTRY_1='00000000-0000-4000-8000-00000000c8a1'
COUNTRY_2='00000000-0000-4000-8000-00000000c8a2'
COUNTRY_3='00000000-0000-4000-8000-00000000c8a3'
EXTRA_ID='00000000-0000-4000-8000-00000000c8af'

db_exec "
insert into public.countries(id,name,short_code) values
 ('$COUNTRY_1','Identity Set One','I81'),
 ('$COUNTRY_2','Identity Set Two','I82'),
 ('$COUNTRY_3','Identity Set Three','I83');
insert into public.editions(id,name,slug,edition_number,status,published)
 values ('$EDITION_ID','S8 Identity Sets','s8-identity-sets',9892,'active',false);
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
 ('$USER_ID'::uuid,'delegation.manage',null),
 ('$USER_ID'::uuid,'communications.send','$EDITION_ID'::uuid);
"
[[ "$(db_value 'select count(*) from public.countries;')" == '3' ]] || fail "fixture does not have exactly three canonical countries"

log "Confirmation requirement batch cannot exceed the full country universe"
rpc "$USER_TOKEN" admin_confirmation_ensure_requirements \
  "{\"p_edition_id\":\"$EDITION_ID\",\"p_country_ids\":[\"$COUNTRY_1\",\"$COUNTRY_2\",\"$COUNTRY_3\",\"$EXTRA_ID\"]}"
expect_failure "oversized confirmation country batch"
[[ "$(db_value "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID';")" == '0' ]] || fail "rejected confirmation batch partially mutated requirements"

rpc "$USER_TOKEN" admin_confirmation_ensure_requirements \
  "{\"p_edition_id\":\"$EDITION_ID\",\"p_country_ids\":[\"$COUNTRY_1\",\"$COUNTRY_2\",\"$COUNTRY_3\"]}"
expect_success "complete valid confirmation country batch"
[[ "$(db_value "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and superseded_at is null;")" == '3' ]] || fail "valid confirmation batch did not materialize exactly three requirements"

log "Specific-country notice target cannot exceed the country universe"
rpc "$USER_TOKEN" studio2_create_notice_draft_v2 \
  "{\"p_edition_id\":\"$EDITION_ID\",\"p_notice_type\":\"official_notice\",\"p_title\":\"Bounded notice\",\"p_body\":\"This is a bounded notice body.\",\"p_severity\":\"info\",\"p_audience\":\"specific_countries\",\"p_audience_group\":null,\"p_country_ids\":[\"$COUNTRY_1\",\"$COUNTRY_2\",\"$COUNTRY_3\",\"$EXTRA_ID\"],\"p_acknowledgement_required\":false,\"p_display_surfaces\":[\"delegation_inbox\"],\"p_supersedes_id\":null}"
expect_failure "oversized notice country audience"

log "Raw destination arrays are bounded by the exact three-destination universe"
rpc "$USER_TOKEN" studio2_create_notice_draft_v2 \
  "{\"p_edition_id\":\"$EDITION_ID\",\"p_notice_type\":\"official_notice\",\"p_title\":\"Bounded notice\",\"p_body\":\"This is a bounded notice body.\",\"p_severity\":\"info\",\"p_audience\":\"specific_countries\",\"p_audience_group\":null,\"p_country_ids\":[\"$COUNTRY_1\"],\"p_acknowledgement_required\":false,\"p_display_surfaces\":[\"delegation_inbox\",\"delegation_inbox\",\"delegation_inbox\",\"delegation_inbox\"],\"p_supersedes_id\":null}"
expect_failure "oversized raw notice destination array"

rpc "$USER_TOKEN" studio2_create_notice_draft_v2 \
  "{\"p_edition_id\":\"$EDITION_ID\",\"p_notice_type\":\"official_notice\",\"p_title\":\"Valid targeted notice\",\"p_body\":\"This valid notice demonstrates normal behavior remains available.\",\"p_severity\":\"info\",\"p_audience\":\"specific_countries\",\"p_audience_group\":null,\"p_country_ids\":[\"$COUNTRY_1\"],\"p_acknowledgement_required\":false,\"p_display_surfaces\":[\"delegation_inbox\"],\"p_supersedes_id\":null}"
expect_success "valid targeted notice draft"
[[ "$(db_value "select count(*) from public.studio2_official_notices where edition_id='$EDITION_ID' and title='Valid targeted notice';")" == '1' ]] || fail "valid notice was not persisted"

log "System V3 S8 identity-set bulk protection rehearsal passed"
