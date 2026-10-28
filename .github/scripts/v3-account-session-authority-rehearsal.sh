#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-account-session-authority] %s\n' "$*"; }
fail() { printf '\n[v3-account-session-authority] FAIL: %s\n' "$*" >&2; exit 1; }

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3AccountAuthority2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" user_agent="${6-Solaris-V3-Account-Authority}"
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

db_value() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt -c "$1"; }

jwt_claim() {
  local token="$1" key="$2"
  python3 - "$token" "$key" <<'PY'
import base64, json, sys
part=sys.argv[1].split('.')[1]
part += '=' * (-len(part) % 4)
payload=json.loads(base64.urlsafe_b64decode(part.encode()))
value=payload.get(sys.argv[2])
print('' if value is None else value)
PY
}

json_field() {
  python3 - "$1" "$2" <<'PY'
import json, sys
value=json.loads(sys.argv[1])
for part in sys.argv[2].split('.'):
    value=value[part]
print(value)
PY
}

log "Rehearsing database-enforced account/session writer authority"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$SOURCE_ROOT/.github/tests/v3-account-session-authority.sql"
log "PASS: canonical account/session SQL authority contract"

log "Creating one disposable viewer with independent target/current Auth sessions"
RUN_TAG="$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
VIEWER_EMAIL="v3-authority-$RUN_TAG@solaris.invalid"
REVOKE_OPERATION="$(python3 -c 'import uuid; print(uuid.uuid4())')"
RACE_OPERATION="$(python3 -c 'import uuid; print(uuid.uuid4())')"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"$VIEWER_EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create rotation viewer"
USER_ID="$(json_field "$HTTP_BODY" id)"
cleanup_viewer() {
  curl -fsS -X DELETE "$API_URL/auth/v1/admin/users/$USER_ID" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" >/dev/null || true
}
trap cleanup_viewer EXIT

request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"$VIEWER_EMAIL\",\"password\":\"$PASSWORD\"}" \
  'Solaris-V3-Rotation-Target'
expect_success "sign in target session"
TARGET_ACCESS_OLD="$(json_field "$HTTP_BODY" access_token)"
TARGET_REFRESH_OLD="$(json_field "$HTTP_BODY" refresh_token)"
TARGET_SESSION="$(jwt_claim "$TARGET_ACCESS_OLD" session_id)"

request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"$VIEWER_EMAIL\",\"password\":\"$PASSWORD\"}" \
  'Solaris-V3-Rotation-Current'
expect_success "sign in current session"
CURRENT_ACCESS="$(json_field "$HTTP_BODY" access_token)"
CURRENT_SESSION="$(jwt_claim "$CURRENT_ACCESS" session_id)"
[[ -n "$TARGET_SESSION" && -n "$CURRENT_SESSION" && "$TARGET_SESSION" != "$CURRENT_SESSION" ]] || fail "Auth sessions did not split as expected"

log "Rotating the target refresh token without creating a second session authority"
request POST "$API_URL/auth/v1/token?grant_type=refresh_token" "$ANON_KEY" "$ANON_KEY" \
  "{\"refresh_token\":\"$TARGET_REFRESH_OLD\"}"
expect_success "refresh target session"
TARGET_ACCESS_NEW="$(json_field "$HTTP_BODY" access_token)"
TARGET_REFRESH_NEW="$(json_field "$HTTP_BODY" refresh_token)"
ROTATED_SESSION="$(jwt_claim "$TARGET_ACCESS_NEW" session_id)"
[[ "$ROTATED_SESSION" == "$TARGET_SESSION" ]] || fail "refresh rotation created split session authority"
[[ "$TARGET_REFRESH_NEW" != "$TARGET_REFRESH_OLD" ]] || fail "refresh token did not rotate"
[[ "$(db_value "select count(*) from auth.sessions where id='$TARGET_SESSION' and user_id='$USER_ID';")" == '1' ]] || fail "rotation lost canonical auth.sessions row"

request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TARGET_ACCESS_OLD" "$ANON_KEY"
expect_success "pre-revocation old access credential"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TARGET_ACCESS_NEW" "$ANON_KEY"
expect_success "pre-revocation rotated access credential"

TARGET_HANDLE="$(db_value "select private.v3_session_handle('$USER_ID'::uuid, '$TARGET_SESSION'::uuid);")"
request POST "$API_URL/rest/v1/rpc/v3_revoke_session" "$CURRENT_ACCESS" "$ANON_KEY" \
  "{\"p_session_handle\":\"$TARGET_HANDLE\",\"p_operation_id\":\"$REVOKE_OPERATION\",\"p_idempotency_key\":\"rotation-revoke:$RUN_TAG\"}"
expect_success "revoke rotated target session"

[[ "$(db_value "select count(*) from auth.sessions where id='$TARGET_SESSION';")" == '0' ]] || fail "revoked auth.sessions row survived"
[[ "$(db_value "select count(*) from auth.refresh_tokens where session_id='$TARGET_SESSION';")" == '0' ]] || fail "refresh-token chain survived session revocation"

request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TARGET_ACCESS_OLD" "$ANON_KEY"
expect_failure "revoked pre-rotation access credential"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]] || fail "old access denial did not come from canonical session guard"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$TARGET_ACCESS_NEW" "$ANON_KEY"
expect_failure "revoked rotated access credential"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]] || fail "rotated access denial did not come from canonical session guard"

request POST "$API_URL/auth/v1/token?grant_type=refresh_token" "$ANON_KEY" "$ANON_KEY" \
  "{\"refresh_token\":\"$TARGET_REFRESH_OLD\"}"
expect_failure "revoked original refresh credential"
request POST "$API_URL/auth/v1/token?grant_type=refresh_token" "$ANON_KEY" "$ANON_KEY" \
  "{\"refresh_token\":\"$TARGET_REFRESH_NEW\"}"
expect_failure "revoked rotated refresh credential"

log "Creating a third session to prove the admitted-request/revocation race boundary"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"$VIEWER_EMAIL\",\"password\":\"$PASSWORD\"}" \
  'Solaris-V3-Race-Target'
expect_success "sign in race target"
RACE_ACCESS="$(json_field "$HTTP_BODY" access_token)"
RACE_SESSION="$(jwt_claim "$RACE_ACCESS" session_id)"
RACE_HANDLE="$(db_value "select private.v3_session_handle('$USER_ID'::uuid, '$RACE_SESSION'::uuid);")"

RACE_LOCK_KEY="$(python3 -c 'import secrets; print(secrets.randbelow(2147483646)+1)')"
LOCK_LOG="$(mktemp)"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v actor="$USER_ID" -v session="$RACE_SESSION" >"$LOCK_LOG" 2>&1 <<SQL &
begin;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'actor', 'role', 'authenticated', 'session_id', :'session')::text,
  true
);
select private.v3_require_active_auth_session();
-- This transaction-scoped marker becomes visible only after session admission.
-- Database polling also works when psql runs inside the local DB container.
select pg_advisory_xact_lock(27184517, $RACE_LOCK_KEY);
select pg_sleep(3);
commit;
SQL
LOCK_PID=$!

for _ in $(seq 1 50); do
  [[ "$(db_value "select exists(select 1 from pg_locks where locktype='advisory' and classid=27184517 and objid=$RACE_LOCK_KEY and granted);")" == 't' ]] && break
  sleep 0.1
done
[[ "$(db_value "select exists(select 1 from pg_locks where locktype='advisory' and classid=27184517 and objid=$RACE_LOCK_KEY and granted);")" == 't' ]] || { cat "$LOCK_LOG" >&2; kill "$LOCK_PID" 2>/dev/null || true; fail "race lock was never acquired"; }

START_MS="$(python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
)"
request POST "$API_URL/rest/v1/rpc/v3_revoke_session" "$CURRENT_ACCESS" "$ANON_KEY" \
  "{\"p_session_handle\":\"$RACE_HANDLE\",\"p_operation_id\":\"$RACE_OPERATION\",\"p_idempotency_key\":\"race-revoke:$RUN_TAG\"}"
END_MS="$(python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
)"
wait "$LOCK_PID" || { cat "$LOCK_LOG" >&2; rm -f "$LOCK_LOG"; fail "admitted request transaction failed"; }
rm -f "$LOCK_LOG"
expect_success "revoke waits for admitted request boundary"
ELAPSED_MS=$((END_MS - START_MS))
(( ELAPSED_MS >= 1800 )) || fail "revocation did not wait for active-session transaction lock (${ELAPSED_MS}ms)"
log "PASS: revocation serialized behind admitted request (${ELAPSED_MS}ms)"

[[ "$(db_value "select count(*) from auth.sessions where id='$RACE_SESSION';")" == '0' ]] || fail "race target session survived committed revocation"
request GET "$API_URL/rest/v1/countries?select=id&limit=1" "$RACE_ACCESS" "$ANON_KEY"
expect_failure "stale race credential after committed revocation"
[[ "$HTTP_BODY" == *"SESSION_REVOKED"* ]] || fail "post-race denial did not come from canonical session guard"

log "Account/session canonical authority rehearsal complete"
