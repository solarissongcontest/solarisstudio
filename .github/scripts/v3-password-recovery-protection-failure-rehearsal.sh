#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[password-recovery-protection-failure] %s\n' "$*"; }
fail() { printf '\n[password-recovery-protection-failure] FAIL: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v psql >/dev/null || fail "psql is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing protection-failure rehearsal against non-local API URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing protection-failure rehearsal against non-local database" ;;
esac

FUNCTION_URL="$API_URL/functions/v1/country-auth"
FUNCTION_LOG="${RUNNER_TEMP:-/tmp}/solaris-country-auth-protection-failure.log"
FUNCTION_PID_FILE="${RUNNER_TEMP:-/tmp}/solaris-country-auth-protection-failure.pid"
EXPECTED_ERROR='Password recovery is temporarily unavailable. Try again shortly.'

restore() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  to service_role;
update public.studio2_platform_operational_state
set mode = 'normal',
    version = version + 1,
    reason = 'Local recovery-protection failure rehearsal cleanup',
    changed_at = now()
where singleton = true;
SQL
  if [[ -f "$FUNCTION_PID_FILE" ]]; then
    kill "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null || true
    rm -f "$FUNCTION_PID_FILE"
  fi
}
trap restore EXIT

function_call() {
  local identifier="$1" tmp body
  body="$(python3 - "$identifier" <<'PY'
import json, sys
print(json.dumps({"action": "recover", "identifier": sys.argv[1]}))
PY
)"
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

assert_generic_503() {
  local identifier="$1" actual_error has_recovery
  function_call "$identifier"
  [[ "$HTTP_STATUS" == "503" ]] || fail "protection failure for $identifier returned HTTP $HTTP_STATUS"
  actual_error="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error", ""))')"
  [[ "$actual_error" == "$EXPECTED_ERROR" ]] || fail "protection failure returned an unexpected error envelope"
  has_recovery="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print("recoveryAvailable" in json.load(sys.stdin))')"
  [[ "$has_recovery" == "False" ]] || fail "protection failure exposed a recoveryAvailable classification"
}

assert_generic_recovery_envelope() {
  local expected_status="$1"
  [[ "$HTTP_STATUS" == "$expected_status" ]] || fail "recovery limiter case returned HTTP $HTTP_STATUS instead of $expected_status"
  ok="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok") is True)')"
  available="$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("recoveryAvailable") is True)')"
  [[ "$ok" == "True" && "$available" == "True" ]] || fail "recovery limiter case broke the enumeration-safe envelope"
}

log "Entering read_only and making only the limiter infrastructure unavailable"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
update public.studio2_platform_operational_state
set mode = 'read_only',
    version = version + 1,
    reason = 'Local recovery-protection failure rehearsal',
    changed_at = now()
where singleton = true;
revoke execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  from service_role;
SQL

: >"$FUNCTION_LOG"
supabase functions serve country-auth --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
echo $! >"$FUNCTION_PID_FILE"

ready=0
for attempt in $(seq 1 45); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTION_URL" || true)"
  if [[ "$status" == "200" ]]; then
    ready=1
    break
  fi
  if ! kill -0 "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null; then
    fail "country-auth exited before protection-failure rehearsal became ready"
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || fail "country-auth did not become ready"

# All identifier classes must receive the same infrastructure-failure response.
# The failure happens before account resolution, so this path cannot enumerate
# whether a country exists or whether it has a recovery mailbox.
assert_generic_503 'definitely_unknown_country_account'
assert_generic_503 'synthetic-recovery@example.test'
assert_generic_503 'synthetic-internal@country.solaris.invalid'
log "Recovery protection infrastructure failure is generic 503 and non-enumerating"

log "Restoring protection and proving limiter exhaustion keeps the generic envelope"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  to service_role;
SQL
limited_identifier="recovery_limit_${GITHUB_RUN_ID:-manual}"
for attempt in $(seq 1 5); do
  function_call "$limited_identifier"
  assert_generic_recovery_envelope 200
done
function_call "$limited_identifier"
assert_generic_recovery_envelope 202

log "Recovery protection failure and exhaustion rehearsal passed"
restore
trap - EXIT
