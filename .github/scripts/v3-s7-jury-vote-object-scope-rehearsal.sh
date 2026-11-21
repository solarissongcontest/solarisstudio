#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s7-jury-scope] %s\n' "$*"; }
fail() { printf '\n[v3-s7-jury-scope] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S7JuryScope2026!'
HTTP_STATUS=''
HTTP_BODY=''
request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  if [[ -n "$data" ]]; then args+=(--data "$data"); fi
  HTTP_STATUS="$(curl "${args[@]}")"; HTTP_BODY="$(cat "$output")"; rm -f "$output"
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
expect_failure_contains() {
  local label="$1" marker="$2"
  expect_failure "$label"
  [[ "$HTTP_BODY" == *"$marker"* ]] || fail "$label failed for the wrong reason; expected '$marker', got: $HTTP_BODY"
  log "PASS: $label reported the intended scope guard"
}
json_value() { local path="$1"; python3 -c 'import json,sys
v=json.load(sys.stdin)
for k in sys.argv[1].split(".") if sys.argv[1] else []: v=v[int(k)] if isinstance(v,list) else v[k]
print("" if v is None else v)' "$path"; }
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure_contains() {
  local label="$1" query="$2" marker="$3" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>"$output"; then
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  if ! grep -Fq "$marker" "$output"; then
    local body
    body="$(cat "$output")"
    rm -f "$output"
    fail "$label failed for the wrong reason; expected '$marker', got: $body"
  fi
  rm -f "$output"
  log "PASS: $label rejected by the intended scope guard"
}
assert_db_eq() {
  local label="$1" query="$2" expected="$3" actual
  actual="$(db_scalar "$query")"
  [[ "$actual" == "$expected" ]] || fail "$label expected '$expected', got '$actual'"
  log "PASS: $label"
}
rpc() { request POST "$API_URL/rest/v1/rpc/$2" "$1" "$ANON_KEY" "$3"; }

# The dual-method cutover retires the legacy Organizer mutation RPCs. Preserve
# hostile scope assertions against the new governed command, with a CAS version
# and an operation ID. No real ballot is submitted; this fixture is loopback.
governed_jury_rpc() {
  local token="$1" legacy_action="$2" body="$3" request_body
  request_body="$(python3 - "$legacy_action" "$body" <<'PY'
import json,sys,uuid
action,payload=sys.argv[1],json.loads(sys.argv[2])
payload["p_action"]="clear" if action=="clear_jury_point" else "assign"
payload["p_expected_version"]=0
payload["p_operation_id"]=str(uuid.uuid4())
payload["p_reason"]=None
payload.setdefault("p_receiving_country_id",None)
payload.setdefault("p_receiving_entity_id",None)
print(json.dumps(payload,separators=(",",":")))
PY
)"
  rpc "$token" v3_organizer_jury_score_apply "$request_body"
}

log "Creating an organizer scoped only to Edition A"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "{\"email\":\"v3-s7-jury@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create scoped jury organizer"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "{\"email\":\"v3-s7-jury@solaris.invalid\",\"password\":\"$PASSWORD\"}"
expect_success "sign in scoped jury organizer"
USER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"

EDITION_A='00000000-0000-4000-8000-00000000a721'
EDITION_B='00000000-0000-4000-8000-00000000b721'
SHOW_A='00000000-0000-4000-8000-00000000a722'
SHOW_B='00000000-0000-4000-8000-00000000b722'
COUNTRY_A='00000000-0000-4000-8000-00000000a723'
COUNTRY_B='00000000-0000-4000-8000-00000000b723'
COUNTRY_C='00000000-0000-4000-8000-00000000c723'
ENTITY_A='00000000-0000-4000-8000-00000000a724'
ENTITY_A_RECIPIENT='00000000-0000-4000-8000-00000000a726'
ENTITY_B='00000000-0000-4000-8000-00000000b724'
CUSTOM_VOTER_A='00000000-0000-4000-8000-00000000a727'
CUSTOM_RECIPIENT_A='00000000-0000-4000-8000-00000000a728'
VOTER_A='00000000-0000-4000-8000-00000000a725'
VOTER_B='00000000-0000-4000-8000-00000000b725'
VOTER_LEGACY_A='00000000-0000-4000-8000-00000000a729'

db_exec "insert into public.editions(id,name,slug,edition_number,status,published) values ('$EDITION_A','Jury Scope A','jury-scope-a',9721,'draft',false),('$EDITION_B','Jury Scope B','jury-scope-b',9722,'draft',false); insert into public.shows(id,edition_id,name) values ('$SHOW_A','$EDITION_A','Show A'),('$SHOW_B','$EDITION_B','Show B'); insert into public.countries(id,name,short_code) values ('$COUNTRY_A','Jury Country A','JSA'),('$COUNTRY_B','Jury Country B','JSB'),('$COUNTRY_C','Jury Country C','JSC'); insert into public.contest_entities(id,edition_id,entity_type,country_id,display_name,abbreviation) values ('$ENTITY_A','$EDITION_A','global','$COUNTRY_A','Entity A','JSA'),('$ENTITY_A_RECIPIENT','$EDITION_A','global','$COUNTRY_B','Recipient in A','JSB'),('$ENTITY_B','$EDITION_B','global','$COUNTRY_B','Entity B','JSB'),('$CUSTOM_VOTER_A','$EDITION_A','custom',null,'Custom voter A','CVA'),('$CUSTOM_RECIPIENT_A','$EDITION_A','custom',null,'Custom recipient A','CRA'); insert into public.voters(id,edition_id,show_id,country_id,contest_entity_id,name) values ('$VOTER_A','$EDITION_A','$SHOW_A','$COUNTRY_A','$ENTITY_A','Voter A'),('$VOTER_B','$EDITION_B','$SHOW_B','$COUNTRY_B','$ENTITY_B','Voter B'),('$VOTER_LEGACY_A','$EDITION_A','$SHOW_A','$COUNTRY_A',null,'Legacy voter A'); insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_ID'::uuid,'jury.ballots.manage','$EDITION_A'::uuid);"

log "User-supplied show, voter and recipient IDs cannot escape Edition A"
governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_B\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_points\":12}"
expect_failure_contains "Edition-A authorization with Edition-B show" "Jury show is not in this edition"
assert_db_eq "wrong-show attempt writes no jury vote" "select count(*) from public.jury_votes where edition_id='$EDITION_A' and points=12;" "0"

governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":\"$VOTER_B\",\"p_voter_country_id\":\"$COUNTRY_B\",\"p_voter_entity_id\":\"$ENTITY_B\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_points\":10}"
expect_failure_contains "Edition-A authorization with Edition-B voter" "Jury voter belongs to another edition"

governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_B\",\"p_points\":8}"
expect_failure_contains "Edition-A authorization with Edition-B recipient entity" "Jury recipient entity belongs to another edition"

# COUNTRY_C exists globally, so this proves edition membership rather than a
# foreign-key failure on a nonexistent country.
governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_receiving_country_id\":\"$COUNTRY_C\",\"p_receiving_entity_id\":null,\"p_points\":7}"
expect_failure_contains "real recipient country without Edition-A membership" "Jury recipient country does not belong to this edition"

governed_jury_rpc "$USER_TOKEN" clear_jury_point "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_B\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_points\":12}"
expect_failure_contains "cross-edition clear is rejected" "Jury show is not in this edition"

log "Show-scoped voters cannot be smuggled into edition-level/null-show votes"
governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":null,\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_points\":6}"
expect_failure_contains "show-scoped voter with null vote show" "Jury show is not in this edition"

log "Country-less custom entities cannot manufacture country identity"
governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":null,\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$CUSTOM_VOTER_A\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_points\":5}"
expect_failure_contains "custom voter entity paired with arbitrary country" "Jury voter entity belongs to another country"

governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":\"$ENTITY_A\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$CUSTOM_RECIPIENT_A\",\"p_points\":4}"
expect_failure_contains "custom recipient entity paired with arbitrary country" "Jury recipient entity belongs to another country"

log "A supplied voter entity must match the voter's canonical identity when one exists"
governed_jury_rpc "$USER_TOKEN" assign_jury_vote "{\"p_edition_id\":\"$EDITION_A\",\"p_show_id\":\"$SHOW_A\",\"p_voter_id\":\"$VOTER_A\",\"p_voter_country_id\":null,\"p_voter_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_receiving_country_id\":\"$COUNTRY_B\",\"p_receiving_entity_id\":\"$ENTITY_A_RECIPIENT\",\"p_points\":3}"
expect_failure_contains "canonical voter/entity mismatch" "Jury voter entity does not match the voter identity"

log "Historical voters without a canonical entity keep their valid country-scoped representation"
# Reverse-parent trigger testing needs one valid SQL row even though the public
# Organizer one-score command correctly keeps partial allocations private.
# This raw fixture is postgres-only in disposable local PG, not application DML.
db_exec "insert into public.jury_votes(edition_id,show_id,voter_id,voter_country_id,voter_entity_id,receiving_country_id,receiving_entity_id,points) values ('$EDITION_A','$SHOW_A','$VOTER_LEGACY_A','$COUNTRY_A','$ENTITY_A','$COUNTRY_B','$ENTITY_A_RECIPIENT',11);"
log "PASS: legacy canonical-null voter remains valid"
assert_db_eq "legacy compatible assignment persisted" "select count(*) from public.jury_votes where voter_id='$VOTER_LEGACY_A' and voter_entity_id='$ENTITY_A' and points=11;" "1"
db_exec "delete from public.jury_votes where show_id='$SHOW_A' and voter_id='$VOTER_LEGACY_A' and points=11;"
log "PASS: legacy compatible point clear"

log "Database invariant protects internal/direct writers too"
db_expect_failure_contains "direct cross-edition show insert" "insert into public.jury_votes(edition_id,show_id,voter_id,voter_country_id,voter_entity_id,receiving_country_id,receiving_entity_id,points) values ('$EDITION_A','$SHOW_B','$VOTER_A','$COUNTRY_A','$ENTITY_A','$COUNTRY_B','$ENTITY_A_RECIPIENT',7);" "Jury vote show belongs to another edition"
assert_db_eq "direct hostile insert leaves no row" "select count(*) from public.jury_votes where edition_id='$EDITION_A' and show_id='$SHOW_B';" "0"

log "Exact same-edition objects remain usable"
db_exec "insert into public.jury_votes(edition_id,show_id,voter_id,voter_country_id,voter_entity_id,receiving_country_id,receiving_entity_id,points) values ('$EDITION_A','$SHOW_A','$VOTER_A','$COUNTRY_A','$ENTITY_A','$COUNTRY_B','$ENTITY_A_RECIPIENT',12);"
log "PASS: same-edition jury vote assignment (synthetic SQL scope fixture)"
assert_db_eq "valid assignment persisted exactly once" "select count(*) from public.jury_votes where edition_id='$EDITION_A' and show_id='$SHOW_A' and voter_id='$VOTER_A' and points=12;" "1"

log "Referenced parent rows cannot drift and retroactively corrupt a valid vote"
db_expect_failure_contains "referenced show edition drift" "update public.shows set edition_id='$EDITION_B' where id='$SHOW_A';" "Referenced jury vote prevents show edition drift"
db_expect_failure_contains "referenced voter edition drift" "update public.voters set edition_id='$EDITION_B' where id='$VOTER_A';" "Referenced jury vote prevents voter scope drift"
db_expect_failure_contains "referenced voter show drift" "update public.voters set show_id='$SHOW_B' where id='$VOTER_A';" "Referenced jury vote prevents voter scope drift"
db_expect_failure_contains "referenced voter entity edition drift" "update public.contest_entities set edition_id='$EDITION_B' where id='$ENTITY_A';" "Referenced jury vote prevents contest entity scope drift"
db_expect_failure_contains "referenced recipient entity edition drift" "update public.contest_entities set edition_id='$EDITION_B' where id='$ENTITY_A_RECIPIENT';" "Referenced jury vote prevents contest entity scope drift"

db_exec "delete from public.jury_votes where show_id='$SHOW_A' and voter_id='$VOTER_A' and points=12;"
log "PASS: same-edition jury point clear (synthetic SQL scope fixture)"
assert_db_eq "valid clear removes the point" "select count(*) from public.jury_votes where edition_id='$EDITION_A' and show_id='$SHOW_A' and voter_id='$VOTER_A' and points=12;" "0"

log "All jury vote object-scope checks passed"
