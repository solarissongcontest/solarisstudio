#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-account-sessions] %s\n' "$*"; }
fail() { printf '\n[v3-account-sessions] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3AccountSessions2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" user_agent="${6-Solaris-V3-Rehearsal}"
  local output
  output="$(mktemp)"
  if [[ -n "$data" ]]; then
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" \
      -H "Authorization: Bearer $bearer" \
      -H "User-Agent: $user_agent" \
      -H 'Content-Type: application/json' \
      --data "$data")"
  else
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" \
      -H "Authorization: Bearer $bearer" \
      -H "User-Agent: $user_agent" \
      -H 'Content-Type: application/json')"
  fi
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

db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

jwt_claim() {
  local token="$1" key="$2"
  python3 - "$token" "$key" <<'PY'
import base64, json, sys
part=sys.argv[1].split('.')[1]
part += '=' * (-len(part) % 4)
payload=json.loads(base64.urlsafe_b64decode(part.encode()))
value=payload.get(sys.argv[2])
if isinstance(value,(dict,list)):
    print(json.dumps(value,separators=(',',':')))
elif value is None:
    print('')
else:
    print(value)
PY
}

create_user() {
  local email="$1"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
  expect_success "create $email"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$HTTP_BODY"
}

sign_in() {
  local email="$1" ua="$2"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
    "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" "$ua"
  expect_success "sign in $email"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$HTTP_BODY"
}

rpc_sessions() {
  local token="$1"
  request POST "$API_URL/rest/v1/rpc/v3_my_sessions" "$token" "$ANON_KEY" '{}'
}

rpc_revoke() {
  local token="$1" handle="$2" operation_id="$3" key="$4"
  request POST "$API_URL/rest/v1/rpc/v3_revoke_session" "$token" "$ANON_KEY" \
    "{\"p_session_handle\":\"$handle\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$key\"}"
}

log "Creating two users and two independent sessions for viewer A"
USER_A="$(create_user 'v3-session-a@solaris.invalid' | tail -n1)"
USER_B="$(create_user 'v3-session-b@solaris.invalid' | tail -n1)"
TOKEN_A1="$(sign_in 'v3-session-a@solaris.invalid' 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36' | tail -n1)"
TOKEN_A2="$(sign_in 'v3-session-a@solaris.invalid' 'Mozilla/5.0 (iPhone; CPU iPhone OS 20_0 like Mac OS X) AppleWebKit/605.1.15 Version/20.0 Mobile/15E148 Safari/604.1' | tail -n1)"
TOKEN_B="$(sign_in 'v3-session-b@solaris.invalid' 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/154.0.0.0' | tail -n1)"

SESSION_A1="$(jwt_claim "$TOKEN_A1" session_id)"
SESSION_A2="$(jwt_claim "$TOKEN_A2" session_id)"
SESSION_B="$(jwt_claim "$TOKEN_B" session_id)"
[[ -n "$SESSION_A1" && -n "$SESSION_A2" && -n "$SESSION_B" ]] || fail "JWT session_id claim missing"
[[ "$SESSION_A1" != "$SESSION_A2" ]] || fail "Second login did not create a distinct Auth session"
[[ "$(db_value "select count(*) from auth.sessions where user_id='$USER_A';")" == '2' ]] || fail "Viewer A does not have two server sessions"

log "Anonymous callers cannot list account sessions"
request POST "$API_URL/rest/v1/rpc/v3_my_sessions" "$ANON_KEY" "$ANON_KEY" '{}'
expect_failure "anonymous session projection"

log "Viewer A receives only its privacy-safe deterministic projection"
rpc_sessions "$TOKEN_A1"
expect_success "viewer A session projection"
PROJECTION_A="$HTTP_BODY"
python3 - "$PROJECTION_A" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
s=p['sessions']
assert len(s)==2, s
assert s[0]['current'] is True, s
assert sum(1 for x in s if x['current'])==1
assert all(len(x['sessionHandle'])==64 for x in s)
assert s[0]['client']['device']=='Linux device', s[0]
assert s[0]['client']['browser']=='Chrome', s[0]
keys=json.dumps(p).lower()
for forbidden in ['"ip"','useragent','accesstoken','refreshtoken','refresh_token','hmac']:
    assert forbidden not in keys, forbidden
PY
[[ "$PROJECTION_A" != *"$SESSION_A1"* ]] || fail "Projection leaked current raw Auth session id"
[[ "$PROJECTION_A" != *"$SESSION_A2"* ]] || fail "Projection leaked other raw Auth session id"
[[ "$PROJECTION_A" != *"Mozilla/5.0"* ]] || fail "Projection leaked raw user agent"

CURRENT_HANDLE="$(python3 - "$PROJECTION_A" <<'PY'
import json,sys
for s in json.loads(sys.argv[1])['sessions']:
    if s['current']:
        print(s['sessionHandle']); break
PY
)"
OTHER_HANDLE="$(python3 - "$PROJECTION_A" <<'PY'
import json,sys
for s in json.loads(sys.argv[1])['sessions']:
    if not s['current']:
        print(s['sessionHandle']); break
PY
)"
[[ -n "$CURRENT_HANDLE" && -n "$OTHER_HANDLE" ]] || fail "Projection did not provide both scoped handles"

log "Viewer B cannot appear in or be targeted through viewer A scope"
rpc_sessions "$TOKEN_B"
expect_success "viewer B session projection"
B_HANDLE="$(python3 - "$HTTP_BODY" <<'PY'
import json,sys
print(json.loads(sys.argv[1])['sessions'][0]['sessionHandle'])
PY
)"
[[ "$PROJECTION_A" != *"$B_HANDLE"* ]] || fail "Viewer A projection leaked viewer B handle"
rpc_revoke "$TOKEN_A1" "$B_HANDLE" '00000000-0000-4000-8000-00000000a613' 'cross-user-probe'
expect_failure "cross-user session revoke"
[[ "$(db_value "select count(*) from auth.sessions where id='$SESSION_B' and user_id='$USER_B';")" == '1' ]] || fail "Cross-user revoke mutated viewer B"

log "The non-current command refuses the current session"
rpc_revoke "$TOKEN_A1" "$CURRENT_HANDLE" '00000000-0000-4000-8000-00000000a614' 'current-session'
expect_failure "current session through non-current revoke"
[[ "$(db_value "select count(*) from auth.sessions where id='$SESSION_A1';")" == '1' ]] || fail "Current-session rejection still deleted the session"

log "Fresh-auth helper rejects stale authentication evidence server-side"
STALE_CLAIMS="$(python3 - "$USER_A" "$SESSION_A1" <<'PY'
import json,sys,time
print(json.dumps({
  'sub':sys.argv[1],
  'role':'authenticated',
  'session_id':sys.argv[2],
  'amr':[{'method':'password','timestamp':int(time.time())-900}]
},separators=(',',':')))
PY
)"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -v claims="$STALE_CLAIMS" -qAt <<'SQL' >/tmp/v3-session-stale.out 2>&1
begin;
select set_config('request.jwt.claims', :'claims', true);
select private.studio2_require_fresh_auth(300);
rollback;
SQL
then
  cat /tmp/v3-session-stale.out >&2
  rm -f /tmp/v3-session-stale.out
  fail "Stale authentication evidence unexpectedly passed"
else
  grep -q "Fresh authentication required" /tmp/v3-session-stale.out || {
    cat /tmp/v3-session-stale.out >&2
    rm -f /tmp/v3-session-stale.out
    fail "Stale-auth rejection did not come from fresh-auth policy"
  }
  rm -f /tmp/v3-session-stale.out
  log "PASS: stale fresh-auth evidence rejected"
fi

log "The active second session can use an ordinary Data API read before revocation"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TOKEN_A2" "$ANON_KEY"
expect_success "active session ordinary Data API read"

log "Canonical Data API gate permits only session recovery in protected operational modes"
# Transactional fixture only: exercise the real hook in both modes, then roll
# back the fixture. No persisted mode repair or alternative revoke writer.
psql "$DB_URL" -v ON_ERROR_STOP=1 -v actor="$USER_A" -v session="$SESSION_A1" -qAt <<'SQL'
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'actor', 'role', 'authenticated', 'session_id', :'session')::text, true);
select set_config('request.method', 'POST', true);
do $test$
declare v_mode text;
begin
  foreach v_mode in array array['read_only', 'maintenance'] loop
    update public.studio2_platform_operational_state set mode = v_mode where singleton;
    perform set_config('request.path', '/rest/v1/rpc/v3_revoke_session', true);
    perform private.studio2_data_api_operational_gate();
    perform set_config('request.path', '/rest/v1/rpc/admin_set_show_running_order', true);
    begin
      perform private.studio2_data_api_operational_gate();
      raise exception 'Unrelated volatile mutation bypassed the protected mode';
    exception when sqlstate '25006' then null;
    end;
  end loop;
end
$test$;
rollback;
SQL

log "Fresh viewer A session revokes its other session and cascades refresh tokens"
OP_ID='00000000-0000-4000-8000-00000000a615'
rpc_revoke "$TOKEN_A1" "$OTHER_HANDLE" "$OP_ID" 'revoke-a2'
expect_success "revoke viewer A second session"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['alreadyRevoked'] is False
assert r['replayed'] is False
PY
[[ "$(db_value "select count(*) from auth.sessions where id='$SESSION_A2';")" == '0' ]] || fail "Revoked Auth session still exists"
[[ "$(db_value "select count(*) from auth.refresh_tokens where session_id='$SESSION_A2';")" == '0' ]] || fail "Revoked session refresh tokens did not cascade"

log "A revoked-but-unexpired access JWT loses the protected session contract immediately"
rpc_sessions "$TOKEN_A2"
expect_failure "revoked session projection"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* || "$HTTP_BODY" == *"AUTHENTICATION"* ]] || fail "Revoked token failed for an unexpected reason: $HTTP_BODY"

log "Revocation denies ordinary reads before any event delivery or UI invalidation"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TOKEN_A2" "$ANON_KEY"
expect_failure "revoked token ordinary Data API read"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]] || fail "Revoked read did not reach the canonical session guard"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TOKEN_A1" "$ANON_KEY"
expect_success "surviving session ordinary Data API read"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$ANON_KEY" "$ANON_KEY"
expect_success "anonymous public read remains available"

log "Exact lost-response retry is idempotent"
rpc_revoke "$TOKEN_A1" "$OTHER_HANDLE" "$OP_ID" 'revoke-a2'
expect_success "exact revoke replay"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['replayed'] is True
PY
[[ "$(db_value "select count(*) from public.studio2_account_session_revocations where user_id='$USER_A';")" == '1' ]] || fail "Exact retry amplified revocation history"

log "A new operation against the same tombstone reconciles as already revoked"
rpc_revoke "$TOKEN_A1" "$OTHER_HANDLE" '00000000-0000-4000-8000-00000000a616' 'revoke-a2-again'
expect_success "already-revoked reconciliation"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['alreadyRevoked'] is True
PY
[[ "$(db_value "select count(*) from public.studio2_account_session_revocations where user_id='$USER_A';")" == '1' ]] || fail "Already-revoked reconciliation duplicated history"

log "Projection reconciles promptly after revocation and exposes privacy-safe history"
rpc_sessions "$TOKEN_A1"
expect_success "post-revocation projection"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
assert len(p['sessions'])==1, p
assert p['sessions'][0]['current'] is True
assert len(p['securityHistory'])==1, p
assert p['securityHistory'][0]['type']=='session_revoked'
PY

log "Browser database roles have no direct Auth-session or tombstone table access"
[[ "$(db_value "select has_table_privilege('authenticated','auth.sessions','SELECT');")" == 'f' ]] || fail "authenticated can directly select auth.sessions"
[[ "$(db_value "select has_table_privilege('authenticated','auth.sessions','DELETE');")" == 'f' ]] || fail "authenticated can directly delete auth.sessions"
[[ "$(db_value "select has_table_privilege('authenticated','auth.refresh_tokens','SELECT');")" == 'f' ]] || fail "authenticated can directly select refresh_tokens"
[[ "$(db_value "select has_table_privilege('authenticated','public.studio2_account_session_revocations','SELECT');")" == 'f' ]] || fail "authenticated can directly select revocation tombstones"
[[ "$(db_value "select has_function_privilege('authenticated','private.v3_session_handle(uuid,uuid)','EXECUTE');")" == 'f' ]] || fail "authenticated can execute private session handle helper"

log "Canonical current-session logout destroys the actual Auth session"
request POST "$API_URL/auth/v1/logout?scope=local" "$TOKEN_A1" "$ANON_KEY" ''
expect_success "current-session Auth sign-out"
[[ "$(db_value "select count(*) from auth.sessions where id='$SESSION_A1';")" == '0' ]] || fail "Current Auth sign-out left session row active"
rpc_sessions "$TOKEN_A1"
expect_failure "signed-out current session projection"

request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TOKEN_A1" "$ANON_KEY"
expect_failure "signed-out token ordinary Data API read"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]] || fail "Sign-out read did not reach the canonical session guard"

log "System V3 P42 account session management rehearsal passed"
