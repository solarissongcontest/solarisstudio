#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s8-prediction] %s\n' "$*"; }
fail() { printf '\n[v3-s8-prediction] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S8Prediction2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
    -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json' \
    ${data:+--data "$data"})"
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
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
rpc_prediction() {
  local token="$1" payload="$2"
  request POST "$API_URL/rest/v1/rpc/submit_prediction" "$token" "$ANON_KEY" \
    "{\"_round_id\":\"$ROUND_ID\",\"_payload\":$payload}"
}

log "Creating authenticated fan identity"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"v3-s8-prediction@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create prediction fan"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
[[ -n "$USER_ID" ]] || fail "Auth admin response had no user id"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"v3-s8-prediction@solaris.invalid\",\"password\":\"$PASSWORD\"}"
expect_success "sign in prediction fan"
USER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
[[ -n "$USER_TOKEN" ]] || fail "Sign-in response had no access token"

EDITION_ID='00000000-0000-4000-8000-00000000e891'
SHOW_ID='00000000-0000-4000-8000-00000000a891'
ROUND_ID='00000000-0000-4000-8000-00000000b891'
COUNTRY_1='00000000-0000-4000-8000-00000000c891'
COUNTRY_2='00000000-0000-4000-8000-00000000c892'
COUNTRY_3='00000000-0000-4000-8000-00000000c893'
PARTICIPANT_1='00000000-0000-4000-8000-00000000d891'
PARTICIPANT_2='00000000-0000-4000-8000-00000000d892'
PARTICIPANT_3='00000000-0000-4000-8000-00000000d893'

log "Seeding one published show with three participants and a winner/top-three round"
db_exec "
insert into public.countries(id,name,short_code) values
  ('$COUNTRY_1','Prediction One','P81'),
  ('$COUNTRY_2','Prediction Two','P82'),
  ('$COUNTRY_3','Prediction Three','P83');
insert into public.editions(id,name,slug,edition_number,status,published) values
  ('$EDITION_ID','S8 Prediction','s8-prediction',9891,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config,qualifier_count) values
  ('$SHOW_ID','$EDITION_ID','S8 Prediction Final','final',1,false,'{}'::jsonb,null);
insert into public.participants(id,edition_id,show_id,country_id,artist,song,semi_final) values
  ('$PARTICIPANT_1','$EDITION_ID','$SHOW_ID','$COUNTRY_1','Artist One','Song One','final'),
  ('$PARTICIPANT_2','$EDITION_ID','$SHOW_ID','$COUNTRY_2','Artist Two','Song Two','final'),
  ('$PARTICIPANT_3','$EDITION_ID','$SHOW_ID','$COUNTRY_3','Artist Three','Song Three','final');
begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"participants\":true}'::jsonb),
      published=true,
      updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public',
      version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"participants\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=null,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id='$SHOW_ID';
commit;
insert into public.prediction_rounds(id,show_id,opens_at,locks_at,status,prediction_types,scoring_version,consensus_minimum)
values ('$ROUND_ID','$SHOW_ID',now()-interval '10 minutes',now()+interval '1 hour','open',array['winner','top_three']::text[],'v1',5);
"

PAYLOAD_ONE="[{\"countryId\":\"$COUNTRY_1\",\"type\":\"winner\",\"rank\":null,\"confidence\":null},{\"countryId\":\"$COUNTRY_1\",\"type\":\"top_three\",\"rank\":1,\"confidence\":0.9},{\"countryId\":\"$COUNTRY_2\",\"type\":\"top_three\",\"rank\":2,\"confidence\":0.8},{\"countryId\":\"$COUNTRY_3\",\"type\":\"top_three\",\"rank\":3,\"confidence\":0.7}]"
PAYLOAD_REORDERED="[{\"countryId\":\"$COUNTRY_3\",\"type\":\"top_three\",\"rank\":3,\"confidence\":0.7},{\"countryId\":\"$COUNTRY_2\",\"type\":\"top_three\",\"rank\":2,\"confidence\":0.8},{\"countryId\":\"$COUNTRY_1\",\"type\":\"winner\",\"rank\":null,\"confidence\":null},{\"countryId\":\"$COUNTRY_1\",\"type\":\"top_three\",\"rank\":1,\"confidence\":0.9}]"
PAYLOAD_CHANGED="[{\"countryId\":\"$COUNTRY_2\",\"type\":\"winner\",\"rank\":null,\"confidence\":null},{\"countryId\":\"$COUNTRY_1\",\"type\":\"top_three\",\"rank\":1,\"confidence\":0.9},{\"countryId\":\"$COUNTRY_2\",\"type\":\"top_three\",\"rank\":2,\"confidence\":0.8},{\"countryId\":\"$COUNTRY_3\",\"type\":\"top_three\",\"rank\":3,\"confidence\":0.7}]"

log "Initial submit creates one entry and one immutable version"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_ONE"
expect_success "initial prediction"
ENTRY_ID="$(printf '%s' "$HTTP_BODY" | tr -d '"')"
[[ -n "$ENTRY_ID" ]] || fail "Prediction RPC returned no entry id"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '1' ]] || fail "Initial prediction version is not 1"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '1' ]] || fail "Initial immutable version count is not 1"
[[ "$(db_value "select count(*) from public.prediction_items where entry_id='$ENTRY_ID';")" == '4' ]] || fail "Initial item count is not 4"
FIRST_SUBMITTED_AT="$(db_value "select submitted_at::text from public.prediction_entries where id='$ENTRY_ID';")"

log "Exact retry does not amplify version history"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_ONE"
expect_success "exact prediction retry"
[[ "$(printf '%s' "$HTTP_BODY" | tr -d '"')" == "$ENTRY_ID" ]] || fail "Exact retry changed entry identity"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '1' ]] || fail "Exact retry incremented version"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '1' ]] || fail "Exact retry appended immutable history"
[[ "$(db_value "select submitted_at::text from public.prediction_entries where id='$ENTRY_ID';")" == "$FIRST_SUBMITTED_AT" ]] || fail "Exact retry rewrote submitted_at"

log "Array order is not semantic identity"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_REORDERED"
expect_success "reordered semantic retry"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '1' ]] || fail "Reordered retry incremented version"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '1' ]] || fail "Reordered retry appended history"

log "Changed semantics create exactly one new version"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_CHANGED"
expect_success "changed prediction"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '2' ]] || fail "Changed prediction did not advance to version 2"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '2' ]] || fail "Changed prediction did not append exactly one version"
[[ "$(db_value "select count(*) from public.prediction_items where entry_id='$ENTRY_ID';")" == '4' ]] || fail "Changed prediction item count drifted"

log "Round-derived item budget rejects oversized arrays before write amplification"
PAYLOAD_TOO_LARGE="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p.append({"countryId":sys.argv[2],"type":"winner","rank":None,"confidence":None}); print(json.dumps(p,separators=(",",":")))' "$PAYLOAD_CHANGED" "$COUNTRY_3")"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_TOO_LARGE"
expect_failure "prediction over configured item budget"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '2' ]] || fail "Oversized prediction mutated version"

log "Unknown item fields are rejected"
PAYLOAD_UNKNOWN_FIELD="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); p[0]["padding"]="forbidden"; print(json.dumps(p,separators=(",",":")))' "$PAYLOAD_CHANGED")"
rpc_prediction "$USER_TOKEN" "$PAYLOAD_UNKNOWN_FIELD"
expect_failure "prediction unsupported item field"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '2' ]] || fail "Unknown-field request appended history"

log "Concurrent identical retries do not amplify versions"
outputs="$(mktemp -d)"
pids=()
for attempt in $(seq 1 8); do
  (
    curl -sS -o "$outputs/body-$attempt" -w '%{http_code}' -X POST \
      "$API_URL/rest/v1/rpc/submit_prediction" \
      -H "apikey: $ANON_KEY" \
      -H "Authorization: Bearer $USER_TOKEN" \
      -H 'Content-Type: application/json' \
      --data "{\"_round_id\":\"$ROUND_ID\",\"_payload\":$PAYLOAD_CHANGED}" > "$outputs/status-$attempt"
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || fail "Concurrent prediction request process failed"; done
for attempt in $(seq 1 8); do
  status="$(cat "$outputs/status-$attempt")"
  (( status >= 200 && status < 300 )) || fail "Concurrent prediction $attempt returned HTTP $status: $(cat "$outputs/body-$attempt")"
done
rm -rf "$outputs"
[[ "$(db_value "select version from public.prediction_entries where id='$ENTRY_ID';")" == '2' ]] || fail "Concurrent retries amplified entry version"
[[ "$(db_value "select count(*) from public.prediction_entry_versions where entry_id='$ENTRY_ID';")" == '2' ]] || fail "Concurrent retries amplified immutable history"

log "Canonical helper remains private"
[[ "$(db_value "select has_function_privilege('anon','private.v3_prediction_payload_canonical(jsonb)','EXECUTE');")" == 'f' ]] || fail "anon can execute canonicalization helper"
[[ "$(db_value "select has_function_privilege('authenticated','private.v3_prediction_payload_canonical(jsonb)','EXECUTE');")" == 'f' ]] || fail "authenticated can execute canonicalization helper"

log "System V3 S8 Prediction replay protection rehearsal passed"
