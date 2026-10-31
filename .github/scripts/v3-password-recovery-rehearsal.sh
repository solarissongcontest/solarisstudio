#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[password-recovery] %s\n' "$*"; }
fail() { printf '\n[password-recovery] FAIL: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

# This rehearsal is deliberately incapable of falling back to hosted Solaris.
# It must run only after an isolated local Supabase stack has been started.
eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing password recovery rehearsal against non-local API_URL=$API_URL" ;;
esac
case "$DB_URL" in
  postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing password recovery rehearsal against non-local DB_URL" ;;
esac

MAILPIT_URL="${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}"
case "$MAILPIT_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing password recovery rehearsal against non-local Mailpit URL=$MAILPIT_URL" ;;
esac

REAL_COUNTRY_ID='00000000-0000-4000-8000-00000000f901'
NO_RECOVERY_COUNTRY_ID='00000000-0000-4000-8000-00000000f902'
REAL_EMAIL='recovery-real@example.test'
NO_RECOVERY_EMAIL='recovery-none@country.solaris.invalid'
REAL_USERNAME='recovery_real'
NO_RECOVERY_USERNAME='recovery_none'
OLD_PASSWORD='LocalRecovery-Old-Aa9!'
NEW_PASSWORD="LocalRecovery-New-${GITHUB_RUN_ID:-manual}-Q7x!"
LOCAL_RESET_ORIGIN='http://127.0.0.1:3000'
FUNCTION_URL="$API_URL/functions/v1/country-auth"
FUNCTION_LOG="${RUNNER_TEMP:-/tmp}/solaris-country-auth-recovery.log"
FUNCTION_PID_FILE="${RUNNER_TEMP:-/tmp}/solaris-country-auth-recovery.pid"

cleanup() {
  if [[ -f "$FUNCTION_PID_FILE" ]]; then
    kill "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null || true
    rm -f "$FUNCTION_PID_FILE"
  fi
}
trap cleanup EXIT

json_field() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    if not part:
        continue
    value = value[int(part)] if isinstance(value, list) else value[part]
print("" if value is None else value)
' "$path"
}

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
  local body="$1"
  local bearer="${2:-$ANON_KEY}"
  local origin="${3:-$LOCAL_RESET_ORIGIN}"
  local tmp
  tmp="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$FUNCTION_URL" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $bearer" \
    -H "Content-Type: application/json" \
    -H "Origin: $origin" \
    --data "$body")"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

create_auth_user() {
  local email="$1" display_name="$2"
  local body
  body="$(python3 -c '
import json, sys
print(json.dumps({
  "email": sys.argv[1],
  "password": sys.argv[2],
  "email_confirm": True,
  "user_metadata": {"display_name": sys.argv[3], "account_type": "country"},
}))
' "$email" "$OLD_PASSWORD" "$display_name")"
  http_json POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "local Auth user creation failed: HTTP $HTTP_STATUS $HTTP_BODY"
  printf '%s' "$HTTP_BODY" | json_field id
}

log "Starting country-auth against isolated local Supabase"
# The local stack includes the Edge Runtime, while `functions serve` loads the
# exact branch source and hot-reloads it through the local gateway.
supabase functions serve country-auth --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
echo $! > "$FUNCTION_PID_FILE"

ready=0
for _ in $(seq 1 45); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTION_URL" || true)"
  if [[ "$status" == "200" ]]; then
    ready=1
    break
  fi
  if ! kill -0 "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null; then
    tail -n 120 "$FUNCTION_LOG" >&2 || true
    fail "country-auth local server exited before becoming ready"
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || { tail -n 120 "$FUNCTION_LOG" >&2 || true; fail "country-auth local server did not become ready"; }

log "Creating disposable local country accounts"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.countries (id, name, short_code, region)
values
  ('$REAL_COUNTRY_ID'::uuid, 'Recoveryland', 'RCV', 'E2E'),
  ('$NO_RECOVERY_COUNTRY_ID'::uuid, 'No Recovery', 'NRC', 'E2E')
on conflict (id) do update
set name = excluded.name, short_code = excluded.short_code, region = excluded.region;
SQL

REAL_USER_ID="$(create_auth_user "$REAL_EMAIL" "Recovery Browser HOD")"
NO_RECOVERY_USER_ID="$(create_auth_user "$NO_RECOVERY_EMAIL" "No Recovery Browser HOD")"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.country_accounts (
  user_id, country_id, status, suspension_reason, instagram_username, display_name
)
values
  ('$REAL_USER_ID'::uuid, '$REAL_COUNTRY_ID'::uuid, 'active', null, '$REAL_USERNAME', 'Recovery Browser HOD'),
  ('$NO_RECOVERY_USER_ID'::uuid, '$NO_RECOVERY_COUNTRY_ID'::uuid, 'active', null, '$NO_RECOVERY_USERNAME', 'No Recovery Browser HOD')
on conflict (user_id) do update
set country_id = excluded.country_id,
    status = excluded.status,
    suspension_reason = excluded.suspension_reason,
    instagram_username = excluded.instagram_username,
    display_name = excluded.display_name,
    updated_at = now();
SQL

log "Verifying recovery availability contracts"
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery_none"}))')"
[[ "$HTTP_STATUS" == "200" ]] || fail "no-recovery request returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "False" ]] || fail "country without recovery email did not return recoveryAvailable=false"

# Direct internal-email identifiers must behave the same as their username.
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery-none@country.solaris.invalid"}))')"
[[ "$HTTP_STATUS" == "200" ]] || fail "internal-email recovery request returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "False" ]] || fail "direct internal email bypassed no-recovery detection"

# Unknown identifiers intentionally return the same generic positive envelope as
# recoverable accounts so callers cannot enumerate country accounts.
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"definitely_unknown_country_account"}))')"
[[ "$HTTP_STATUS" == "200" ]] || fail "unknown recovery request returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "True" ]] || fail "unknown identifier broke enumeration-safe recovery envelope"

log "Requesting a real local recovery email"
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery_real"}))')"
[[ "$HTTP_STATUS" == "200" ]] || fail "recoverable account request returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "True" ]] || fail "recoverable account did not return recoveryAvailable=true"

log "Reading captured recovery email from local Mailpit"
MAIL_HTML=''
for _ in $(seq 1 30); do
  MAIL_HTML="$(curl -fsS "$MAILPIT_URL/view/latest.html?query=to%3A$REAL_EMAIL" 2>/dev/null || true)"
  [[ -n "$MAIL_HTML" ]] && break
  sleep 1
done
[[ -n "$MAIL_HTML" ]] || fail "Mailpit did not capture the recovery email"

RECOVERY_LINK="$(printf '%s' "$MAIL_HTML" | python3 -c '
from html.parser import HTMLParser
import html, sys
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            href = dict(attrs).get("href")
            if href: self.links.append(html.unescape(href))
p=Links(); p.feed(sys.stdin.read())
links=[x for x in p.links if "/auth/v1/verify" in x and "type=recovery" in x]
print(links[0] if links else "")
')"
[[ -n "$RECOVERY_LINK" ]] || fail "captured recovery email did not contain a Supabase recovery link"

python3 - "$RECOVERY_LINK" "$LOCAL_RESET_ORIGIN/auth/reset" <<'PY'
import sys, urllib.parse
link = urllib.parse.urlparse(sys.argv[1])
expected = sys.argv[2]
params = urllib.parse.parse_qs(link.query)
redirect = params.get("redirect_to", [""])[0]
if redirect != expected:
    raise SystemExit(f"recovery email redirect_to mismatch: {redirect!r} != {expected!r}")
PY

log "Rejecting an invalid recovery token"
INVALID_URL="$API_URL/auth/v1/verify?token=invalid-recovery-token&type=recovery&redirect_to=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("http://127.0.0.1:3000/auth/reset", safe=""))')"
invalid_headers="$(mktemp)"
invalid_body="$(mktemp)"
invalid_status="$(curl -sS -D "$invalid_headers" -o "$invalid_body" -w '%{http_code}' "$INVALID_URL")"
invalid_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); sub(/^[^:]+:[[:space:]]*/, "", $0); print; exit}' "$invalid_headers")"
if (( invalid_status >= 300 && invalid_status < 400 )); then
  [[ "$invalid_location" == *"error"* ]] || fail "invalid recovery token redirected without an error marker: $invalid_location"
elif (( invalid_status < 400 )); then
  fail "invalid recovery token unexpectedly succeeded with HTTP $invalid_status"
fi
rm -f "$invalid_headers" "$invalid_body"

log "Redeeming the captured recovery link"
headers="$(mktemp)"
body="$(mktemp)"
verify_status="$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' "$RECOVERY_LINK")"
(( verify_status >= 300 && verify_status < 400 )) || { cat "$body" >&2 || true; fail "recovery link verification returned HTTP $verify_status"; }
LOCATION="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); sub(/^[^:]+:[[:space:]]*/, "", $0); print; exit}' "$headers")"
rm -f "$headers" "$body"
[[ "$LOCATION" == "$LOCAL_RESET_ORIGIN/auth/reset#"* ]] || fail "valid recovery link did not return to local /auth/reset: $LOCATION"

ACCESS_TOKEN="$(python3 - "$LOCATION" <<'PY'
import sys, urllib.parse
parsed = urllib.parse.urlparse(sys.argv[1])
fragment = urllib.parse.parse_qs(parsed.fragment)
if fragment.get("type", [""])[0] != "recovery":
    raise SystemExit("recovery redirect did not create a recovery session")
print(fragment.get("access_token", [""])[0])
PY
)"
[[ -n "$ACCESS_TOKEN" ]] || fail "recovery redirect did not contain an access token"

log "Changing the password through canonical country-auth"
set_password_body="$(python3 - "$NEW_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"set-password","password":sys.argv[1]}))
PY
)"
function_call "$set_password_body" "$ACCESS_TOKEN"
[[ "$HTTP_STATUS" == "200" ]] || fail "set-password returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_field ok)" == "True" ]] || fail "set-password did not return ok=true"

log "Proving the new password signs in through canonical country-auth"
signin_body="$(python3 - "$REAL_USERNAME" "$NEW_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$signin_body"
[[ "$HTTP_STATUS" == "200" ]] || fail "new-password sign-in returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ -n "$(printf '%s' "$HTTP_BODY" | json_field accessToken)" ]] || fail "new-password sign-in did not return accessToken"
[[ -n "$(printf '%s' "$HTTP_BODY" | json_field refreshToken)" ]] || fail "new-password sign-in did not return refreshToken"

old_signin_body="$(python3 - "$REAL_USERNAME" "$OLD_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$old_signin_body"
[[ "$HTTP_STATUS" == "401" ]] || fail "old password still signed in after reset (HTTP $HTTP_STATUS)"

log "Password recovery rehearsal passed"
