#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[country-auth-readonly] %s\n' "$*"; }
fail() { printf '\n[country-auth-readonly] FAIL: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing hosted Supabase API: $API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "refusing non-local database" ;;
esac

FUNCTION_URL="$API_URL/functions/v1/country-auth"
FUNCTION_LOG="${RUNNER_TEMP:-/tmp}/solaris-country-auth-readonly.log"
FUNCTION_PID=''
HTTP_STATUS=''
HTTP_BODY=''
ACL_REVOKED=0

cleanup() {
  if [[ "$ACL_REVOKED" == "1" ]]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
to service_role;
SQL
  fi
  if [[ -n "$FUNCTION_PID" ]]; then
    kill "$FUNCTION_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

request() {
  local method="$1" url="$2" bearer="$3" apikey="$4" body="${5-}"
  local tmp
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $apikey"
    -H "Authorization: Bearer $bearer"
    -H 'Content-Type: application/json')
  [[ -n "$body" ]] && args+=(--data "$body")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

function_call() {
  local body="$1" address="$2"
  local tmp
  tmp="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$FUNCTION_URL" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://127.0.0.1:3000' \
    -H "CF-Connecting-IP: $address" \
    -H "X-Forwarded-For: $address" \
    --data "$body")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

json_field() {
  local field="$1"
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$field"
}

sha256_value() {
  python3 - "$1" <<'PY'
import hashlib, sys
print(hashlib.sha256(sys.argv[1].encode()).hexdigest())
PY
}

expect_blocked_by_gate() {
  local label="$1"
  (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded"
  [[ "$HTTP_BODY" == *'25006'* ]] || fail "$label did not fail with SQLSTATE 25006"
  [[ "$HTTP_BODY" == *'read_only'* ]] || fail "$label did not fail because of read_only"
  log "PASS: $label remains blocked"
}

log "Forcing the disposable local platform to read_only"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
update public.studio2_platform_operational_state
set mode = 'read_only'
where singleton = true;
SQL
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "local platform did not enter read_only"

LIMITER_BODY='{"p_scope":"readonly-rehearsal","p_key_hash":"readonly-rehearsal-hash","p_limit":5,"p_window_seconds":900}'
request POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$LIMITER_BODY"
[[ "$HTTP_STATUS" == "200" && "$HTTP_BODY" == "true" ]] || fail "service-role limiter failed in read_only (HTTP $HTTP_STATUS)"
log "PASS: exact limiter RPC crosses read_only gate"

request POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$ANON_KEY" "$ANON_KEY" "$LIMITER_BODY"
(( HTTP_STATUS >= 400 )) || fail "anon directly executed the limiter"
log "PASS: anon cannot execute limiter directly"

RUN_TAG="${GITHUB_RUN_ID:-local}-${RANDOM}"
TEST_EMAIL="readonly-${RUN_TAG}@example.test"
TEST_PASSWORD="$(python3 -c 'import secrets; print("R0-" + secrets.token_urlsafe(18))')"
TEST_USERNAME="readonly_${RANDOM}"
TEST_COUNTRY_ID='00000000-0000-4000-8000-00000000f911'
AUTH_BODY="$(python3 - "$TEST_EMAIL" "$TEST_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))
PY
)"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$AUTH_BODY"
(( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "local disposable auth user creation failed (HTTP $HTTP_STATUS)"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_field id)"

SIGNIN_AUTH_BODY="$(python3 - "$TEST_EMAIL" "$TEST_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))
PY
)"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$SIGNIN_AUTH_BODY"
[[ "$HTTP_STATUS" == "200" ]] || fail "local disposable auth sign-in failed"
AUTH_TOKEN="$(printf '%s' "$HTTP_BODY" | json_field access_token)"
[[ -n "$AUTH_TOKEN" ]] || fail "local disposable auth token missing"

request POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$AUTH_TOKEN" "$ANON_KEY" "$LIMITER_BODY"
(( HTTP_STATUS >= 400 )) || fail "authenticated caller directly executed the limiter"
log "PASS: authenticated cannot execute limiter directly"

BLOCKED_COUNTRY_ID='00000000-0000-4000-8000-00000000f912'
request POST "$API_URL/rest/v1/countries" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  '{"id":"00000000-0000-4000-8000-00000000f912","name":"Blocked Read-only Write","short_code":"BRW","region":"E2E"}'
expect_blocked_by_gate "unrelated service-role table write"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from public.countries where id = '$BLOCKED_COUNTRY_ID'::uuid;")" == "0" ]] \
  || fail "blocked table write mutated data"

# Session revocation is sanctioned security recovery in restricted modes.
# Account claiming is an ordinary mutation and must still hit the global gate.
request POST "$API_URL/rest/v1/rpc/claim_country_account" "$AUTH_TOKEN" "$ANON_KEY" \
  '{"_country_id":"00000000-0000-4000-8000-00000000f914"}'
expect_blocked_by_gate "unrelated mutation RPC"

log "Creating disposable country-account fixture through the local database"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.countries (id, name, short_code, region)
values ('$TEST_COUNTRY_ID'::uuid, 'Read-only Auth Test', 'RAT', 'E2E')
on conflict (id) do update set name=excluded.name, short_code=excluded.short_code, region=excluded.region;

insert into public.country_accounts (user_id, country_id, status, instagram_username, display_name)
values ('$USER_ID'::uuid, '$TEST_COUNTRY_ID'::uuid, 'active', '$TEST_USERNAME', 'Read-only Auth Test')
on conflict (user_id) do update
set country_id=excluded.country_id,
    status=excluded.status,
    instagram_username=excluded.instagram_username,
    display_name=excluded.display_name,
    updated_at=now();
SQL

: >"$FUNCTION_LOG"
supabase functions serve country-auth --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
FUNCTION_PID=$!
ready=0
for attempt in $(seq 1 45); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTION_URL" || true)"
  if [[ "$status" == "200" ]]; then ready=1; break; fi
  kill -0 "$FUNCTION_PID" 2>/dev/null || fail "country-auth local server exited before ready"
  sleep 1
done
[[ "$ready" == "1" ]] || fail "country-auth local server did not become ready"

VALID_COUNTRY_SIGNIN="$(python3 - "$TEST_USERNAME" "$TEST_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$VALID_COUNTRY_SIGNIN" '198.51.100.21'
[[ "$HTTP_STATUS" == "200" ]] || fail "valid country sign-in did not reach password authentication in read_only (HTTP $HTTP_STATUS)"
[[ -n "$(printf '%s' "$HTTP_BODY" | json_field accessToken)" ]] || fail "valid country sign-in returned no access token"
log "PASS: valid country sign-in reaches password authentication in read_only"

INVALID_COUNTRY_SIGNIN="$(python3 - "$TEST_USERNAME" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":"not-the-password"}))
PY
)"
function_call "$INVALID_COUNTRY_SIGNIN" '198.51.100.22'
[[ "$HTTP_STATUS" == "401" ]] || fail "invalid credentials did not reach canonical password rejection in read_only (HTTP $HTTP_STATUS)"
log "PASS: invalid credentials still reject canonically"

LIMITED_ADDRESS='198.51.100.23'
LIMITED_ADDRESS_HASH="$(sha256_value "signin:address|$LIMITED_ADDRESS")"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into private.country_auth_rate_limits (scope, key_hash, window_started_at, attempts, updated_at)
values ('signin:address', '$LIMITED_ADDRESS_HASH', now(), 60, now())
on conflict (scope, key_hash) do update
set window_started_at=excluded.window_started_at, attempts=excluded.attempts, updated_at=excluded.updated_at;
SQL
function_call "$VALID_COUNTRY_SIGNIN" "$LIMITED_ADDRESS"
[[ "$HTTP_STATUS" == "429" ]] || fail "excessive read_only sign-in attempts were not rate limited (HTTP $HTTP_STATUS)"
log "PASS: sign-in rate limiting remains enforced"

RECOVERY_LIMIT_ADDRESS='198.51.100.24'
RECOVERY_LIMIT_HASH="$(sha256_value "recover:address|$RECOVERY_LIMIT_ADDRESS")"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into private.country_auth_rate_limits (scope, key_hash, window_started_at, attempts, updated_at)
values ('recover:address', '$RECOVERY_LIMIT_HASH', now(), 15, now())
on conflict (scope, key_hash) do update
set window_started_at=excluded.window_started_at, attempts=excluded.attempts, updated_at=excluded.updated_at;
SQL
function_call '{"action":"recover","identifier":"rate-limited-one"}' "$RECOVERY_LIMIT_ADDRESS"
RATE_LIMIT_BODY="$HTTP_BODY"
[[ "$HTTP_STATUS" == "202" ]] || fail "exhausted recovery budget did not return generic HTTP 202"
function_call '{"action":"recover","identifier":"rate-limited-two"}' "$RECOVERY_LIMIT_ADDRESS"
[[ "$HTTP_STATUS" == "202" && "$HTTP_BODY" == "$RATE_LIMIT_BODY" ]] \
  || fail "recovery exhaustion became identifier-enumerable"
log "PASS: exhausted recovery budget preserves generic anti-enumeration envelope"

log "Temporarily removing the local service-role limiter privilege to exercise infrastructure failure"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
revoke execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
from service_role;
SQL
ACL_REVOKED=1
EXPECTED_FAILURE='{"error":"Password recovery is temporarily unavailable. Try again shortly."}'
for identifier in "$TEST_USERNAME" 'unknown-readonly-account' 'internal@country.solaris.invalid'; do
  body="$(python3 - "$identifier" <<'PY'
import json, sys
print(json.dumps({"action":"recover","identifier":sys.argv[1]}))
PY
)"
  function_call "$body" '198.51.100.25'
  [[ "$HTTP_STATUS" == "503" && "$HTTP_BODY" == "$EXPECTED_FAILURE" ]] \
    || fail "rate-limit infrastructure failure was not a generic 503"
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
to service_role;
SQL
ACL_REVOKED=0
log "PASS: limiter infrastructure failure is generic 503, not fake success"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select has_function_privilege('service_role','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE');")" == "t" ]] || fail "service_role limiter privilege was not restored"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select has_function_privilege('anon','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE');")" == "f" ]] || fail "anon gained limiter execution"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select has_function_privilege('authenticated','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE');")" == "f" ]] || fail "authenticated gained limiter execution"

log "Country-auth read_only gate checks passed"
