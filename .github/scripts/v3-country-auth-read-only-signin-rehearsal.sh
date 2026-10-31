#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[country-auth-read-only-signin] %s\n' "$*"; }
fail() { printf '\n[country-auth-read-only-signin] FAIL: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v psql >/dev/null || fail "psql is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing sign-in rehearsal against non-local API URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing sign-in rehearsal against non-local database" ;;
esac

COUNTRY_ID='00000000-0000-4000-8000-00000000f911'
EMAIL='read-only-signin@example.test'
USERNAME='read_only_signin'
PASSWORD='ReadOnlySignin-Aa9!'
FUNCTION_URL="$API_URL/functions/v1/country-auth"
FUNCTION_LOG="${RUNNER_TEMP:-/tmp}/solaris-country-auth-read-only-signin.log"
FUNCTION_PID_FILE="${RUNNER_TEMP:-/tmp}/solaris-country-auth-read-only-signin.pid"

restore() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
update public.studio2_platform_operational_state
set mode = 'normal',
    version = version + 1,
    reason = 'Local read-only sign-in rehearsal cleanup',
    changed_at = now()
where singleton = true;
SQL
  if [[ -f "$FUNCTION_PID_FILE" ]]; then
    kill "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null || true
    rm -f "$FUNCTION_PID_FILE"
  fi
}
trap restore EXIT

http_json() {
  local method="$1" url="$2" bearer="$3" apikey="$4" body="${5-}"
  local tmp status
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $apikey"
    -H "Authorization: Bearer $bearer"
    -H "Content-Type: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")
  status="$(curl "${args[@]}")"
  HTTP_STATUS="$status"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

function_call() {
  local body="$1" tmp
  tmp="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$FUNCTION_URL" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Origin: http://127.0.0.1:3000" \
    --data "$body")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

log "Creating an isolated local country-account fixture"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.countries (id, name, short_code, region)
values ('$COUNTRY_ID'::uuid, 'Read Only Signin', 'ROS', 'E2E')
on conflict (id) do update
set name = excluded.name, short_code = excluded.short_code, region = excluded.region;
SQL

create_body="$(python3 - "$EMAIL" "$PASSWORD" "$COUNTRY_ID" "$USERNAME" <<'PY'
import json, sys
print(json.dumps({
  "email": sys.argv[1],
  "password": sys.argv[2],
  "email_confirm": True,
  "user_metadata": {
    "display_name": "Read Only Signin HOD",
    "account_type": "country",
    "country_id": sys.argv[3],
    "instagram_username": sys.argv[4],
  },
}))
PY
)"
http_json POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$create_body"
(( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "local Auth user creation returned HTTP $HTTP_STATUS"
USER_ID="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.country_accounts (
  user_id, country_id, status, suspension_reason, instagram_username, display_name
)
values (
  '$USER_ID'::uuid, '$COUNTRY_ID'::uuid, 'active', null, '$USERNAME', 'Read Only Signin HOD'
)
on conflict (user_id) do update
set country_id = excluded.country_id,
    status = excluded.status,
    suspension_reason = excluded.suspension_reason,
    instagram_username = excluded.instagram_username,
    display_name = excluded.display_name,
    updated_at = now();

update public.studio2_platform_operational_state
set mode = 'read_only',
    version = version + 1,
    reason = 'Local country-auth read-only sign-in rehearsal',
    changed_at = now()
where singleton = true;
SQL

mode="$(psql "$DB_URL" -Atqc "select mode from public.studio2_platform_operational_state where singleton = true")"
[[ "$mode" == "read_only" ]] || fail "platform did not enter read_only"

: >"$FUNCTION_LOG"
supabase functions serve country-auth --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
echo $! >"$FUNCTION_PID_FILE"
ready=0
for attempt in $(seq 1 45); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTION_URL" || true)"
  if [[ "$status" == "200" ]]; then ready=1; break; fi
  if ! kill -0 "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null; then
    fail "country-auth exited before sign-in rehearsal became ready"
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || fail "country-auth did not become ready"

log "Proving a valid password reaches actual authentication in read_only"
valid_body="$(python3 - "$USERNAME" "$PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$valid_body"
[[ "$HTTP_STATUS" == "200" ]] || fail "valid read-only sign-in returned HTTP $HTTP_STATUS"
access_present="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(bool(json.load(sys.stdin).get("accessToken")))')"
[[ "$access_present" == "True" ]] || fail "valid read-only sign-in did not return a session"

log "Proving invalid credentials still fail as credentials, not protection infrastructure"
invalid_body="$(python3 - "$USERNAME" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":"Definitely-Wrong-Aa9!"}))
PY
)"
function_call "$invalid_body"
[[ "$HTTP_STATUS" == "401" ]] || fail "invalid credentials returned HTTP $HTTP_STATUS instead of 401"

log "Proving excessive attempts are still rate-limited during read_only"
limited_identifier="read_only_limit_${GITHUB_RUN_ID:-manual}"
for attempt in $(seq 1 20); do
  body="$(python3 - "$limited_identifier" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":"Wrong-Aa9!"}))
PY
)"
  function_call "$body"
  [[ "$HTTP_STATUS" == "401" ]] || fail "pre-limit attempt $attempt returned HTTP $HTTP_STATUS"
done
body="$(python3 - "$limited_identifier" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":"Wrong-Aa9!"}))
PY
)"
function_call "$body"
[[ "$HTTP_STATUS" == "429" ]] || fail "rate-limit exhaustion returned HTTP $HTTP_STATUS instead of 429"

log "Read-only sign-in and rate-limit rehearsal passed"
restore
trap - EXIT
