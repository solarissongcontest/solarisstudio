#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[country-auth-read-only] %s\n' "$*"; }
fail() { printf '\n[country-auth-read-only] FAIL: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing read-only auth rehearsal against non-local API URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing read-only auth rehearsal against non-local database" ;;
esac

http_json() {
  local method="$1" url="$2" bearer="$3" apikey="$4" body="${5-}"
  local tmp
  tmp="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
    -H "apikey: $apikey" \
    -H "Authorization: Bearer $bearer" \
    -H "Content-Type: application/json" \
    ${body:+--data "$body"})"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

set_mode() {
  local mode="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
update public.studio2_platform_operational_state
set mode = '$mode',
    version = version + 1,
    reason = 'Local country-auth read-only rehearsal',
    changed_at = now()
where singleton = true;
SQL
}

assert_mode() {
  local expected="$1" actual
  actual="$(psql "$DB_URL" -Atqc "select mode from public.studio2_platform_operational_state where singleton = true")"
  [[ "$actual" == "$expected" ]] || fail "expected platform mode $expected, got $actual"
}

assert_limiter_service_role() {
  local scope="$1"
  http_json POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"p_scope\":\"$scope\",\"p_key_hash\":\"$(printf '%064d' 1)\",\"p_limit\":1,\"p_window_seconds\":900}"
  [[ "$HTTP_STATUS" == "200" ]] || fail "service-role limiter request returned HTTP $HTTP_STATUS: $HTTP_BODY"
  [[ "$HTTP_BODY" == "true" ]] || fail "first limiter request did not consume an allowed attempt"

  http_json POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"p_scope\":\"$scope\",\"p_key_hash\":\"$(printf '%064d' 1)\",\"p_limit\":1,\"p_window_seconds\":900}"
  [[ "$HTTP_STATUS" == "200" ]] || fail "second service-role limiter request returned HTTP $HTTP_STATUS: $HTTP_BODY"
  [[ "$HTTP_BODY" == "false" ]] || fail "limiter did not reject the exhausted budget"
}

assert_public_denied() {
  http_json POST "$API_URL/rest/v1/rpc/country_auth_consume_rate_limit" "$ANON_KEY" "$ANON_KEY" \
    '{"p_scope":"anonymous-direct","p_key_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","p_limit":10,"p_window_seconds":900}'
  (( HTTP_STATUS >= 400 )) || fail "anonymous caller unexpectedly executed the limiter"

  if psql "$DB_URL" -v ON_ERROR_STOP=1 >/tmp/country-auth-authenticated-rpc.out 2>&1 <<'SQL'
begin;
set local role authenticated;
select public.country_auth_consume_rate_limit(
  'authenticated-direct',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  10,
  900
);
rollback;
SQL
  then
    fail "authenticated role unexpectedly executed the limiter"
  fi
  rm -f /tmp/country-auth-authenticated-rpc.out
}

assert_unrelated_writes_blocked() {
  http_json POST "$API_URL/rest/v1/rpc/solaris_claim_pending_notification_deliveries" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    '{"p_limit":1}'
  (( HTTP_STATUS >= 400 )) || fail "unrelated mutation RPC escaped the operational gate"
  [[ "$HTTP_BODY" == *"normal writes are unavailable"* ]] || fail "unrelated mutation RPC failed for an unexpected reason"

  http_json POST "$API_URL/rest/v1/countries" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    '{"id":"00000000-0000-4000-8000-00000000fa11","name":"Blocked Write Probe","short_code":"BWP","region":"E2E"}'
  (( HTTP_STATUS >= 400 )) || fail "unrelated table write escaped the operational gate"
  [[ "$HTTP_BODY" == *"normal writes are unavailable"* ]] || fail "unrelated table write failed for an unexpected reason"
}

log "Verifying exact privilege boundary"
privileges="$(psql "$DB_URL" -Atqc "select has_function_privilege('anon','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE')::text || ',' || has_function_privilege('authenticated','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE')::text || ',' || has_function_privilege('service_role','public.country_auth_consume_rate_limit(text,text,integer,integer)','EXECUTE')::text")"
[[ "$privileges" == "false,false,true" ]] || fail "unexpected limiter privileges: $privileges"

log "Verifying read_only exception"
set_mode read_only
assert_mode read_only
assert_limiter_service_role "read-only-gate-${GITHUB_RUN_ID:-manual}"
assert_public_denied
assert_unrelated_writes_blocked

log "Verifying the same exact security RPC remains usable in maintenance"
set_mode maintenance
assert_mode maintenance
assert_limiter_service_role "maintenance-gate-${GITHUB_RUN_ID:-manual}"
assert_public_denied
assert_unrelated_writes_blocked

set_mode normal
assert_mode normal
log "Read-only country-auth gate rehearsal passed"
