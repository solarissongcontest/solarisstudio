#!/usr/bin/env bash
set -euo pipefail

TRACE_FILE="${RECOVERY_TRACE_FILE:-}"
CURRENT_STAGE="bootstrap"

trace() {
  local line="$1"
  printf '%s\n' "$line"
  if [[ -n "$TRACE_FILE" ]]; then
    mkdir -p "$(dirname "$TRACE_FILE")"
    printf '%s\n' "$line" >>"$TRACE_FILE"
  fi
}

stage() {
  CURRENT_STAGE="$1"
  trace "[recovery-stage] $CURRENT_STAGE"
}

log() { printf '\n[password-recovery] %s\n' "$*"; }
fail() {
  local rc="${2:-1}"
  trace "[recovery-stage] FAIL stage=$CURRENT_STAGE exit=$rc cwd=$(pwd -P)"
  printf '\n[password-recovery] FAIL: %s\n' "$1" >&2
  exit "$rc"
}

file_hash() {
  local path="$1"
  if [[ -f "$path" ]]; then
    sha256sum "$path" | awk '{print $1}'
  else
    printf 'missing'
  fi
}

safe_http_category() {
  local body="${1-}"
  printf '%s' "$body" | python3 -c '
import json, re, sys
try:
    value = json.load(sys.stdin)
except Exception:
    print("non-json")
    raise SystemExit(0)
for key in ("code", "error_code", "error"):
    candidate = value.get(key) if isinstance(value, dict) else None
    if isinstance(candidate, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", candidate):
        print(candidate)
        raise SystemExit(0)
print("json")
'
}

command -v curl >/dev/null || fail "curl is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"
command -v sha256sum >/dev/null || fail "sha256sum is required"

stage "local-status"
# This rehearsal is deliberately incapable of falling back to hosted Solaris.
# It must run only after an isolated local Supabase stack has been started.
eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
: "${ANON_KEY:?missing local ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing password recovery rehearsal against non-local API URL" ;;
esac
case "$DB_URL" in
  postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing password recovery rehearsal against non-local DB URL" ;;
esac

MAILPIT_URL="${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}"
case "$MAILPIT_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing password recovery rehearsal against non-local Mailpit URL" ;;
esac

stage "api-availability"
api_health_status="$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/auth/v1/health" || true)"
trace "[recovery-http] stage=api-availability status=${api_health_status:-000}"

stage "mailpit-availability"
mailpit_health_status="$(curl -sS -o /dev/null -w '%{http_code}' "$MAILPIT_URL/api/v1/info" || true)"
trace "[recovery-http] stage=mailpit-availability status=${mailpit_health_status:-000}"

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
  local email="$1" display_name="$2" country_id="$3" instagram_username="$4"
  local body category
  body="$(python3 -c '
import json, sys
print(json.dumps({
  "email": sys.argv[1],
  "password": sys.argv[2],
  "email_confirm": True,
  "user_metadata": {
    "display_name": sys.argv[3],
    "account_type": "country",
    "country_id": sys.argv[4],
    "instagram_username": sys.argv[5],
  },
}))
' "$email" "$OLD_PASSWORD" "$display_name" "$country_id" "$instagram_username")"
  http_json POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    category="$(safe_http_category "$HTTP_BODY")"
    trace "[recovery-http] stage=$CURRENT_STAGE status=$HTTP_STATUS category=$category"
    fail "local Auth user creation failed with HTTP $HTTP_STATUS"
  fi
  printf '%s' "$HTTP_BODY" | json_field id
}

stage "function-start"
selected_root="$(pwd -P)"
selected_source="$selected_root/supabase/functions/country-auth/index.ts"
pr_root="${GITHUB_WORKSPACE:-$selected_root}"
pr_source="$pr_root/supabase/functions/country-auth/index.ts"
main_root="${RECOVERY_MAIN_WORKTREE:-/tmp/solaris-account-session-main}"
main_source="$main_root/supabase/functions/country-auth/index.ts"
trace "[recovery-source] selected_root=$selected_root selected_hash=$(file_hash "$selected_source") pr_hash=$(file_hash "$pr_source") main_hash=$(file_hash "$main_source")"
log "Starting country-auth against isolated local Supabase"
# The local stack includes the Edge Runtime, while `functions serve` loads the
# exact checkout source selected by the current project root.
: >"$FUNCTION_LOG"
supabase functions serve country-auth --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
echo $! > "$FUNCTION_PID_FILE"
trace "[recovery-process] stage=function-start pid=$(cat "$FUNCTION_PID_FILE")"

stage "function-ready"
ready=0
for attempt in $(seq 1 45); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTION_URL" || true)"
  if [[ "$status" == "200" ]]; then
    ready=1
    trace "[recovery-http] stage=function-ready status=$status attempt=$attempt"
    break
  fi
  if ! kill -0 "$(cat "$FUNCTION_PID_FILE")" 2>/dev/null; then
    log_bytes="$(wc -c <"$FUNCTION_LOG" | tr -d ' ')"
    trace "[recovery-process] stage=function-ready state=exited log_bytes=$log_bytes log_hash=$(file_hash "$FUNCTION_LOG")"
    fail "country-auth local server exited before becoming ready"
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  log_bytes="$(wc -c <"$FUNCTION_LOG" | tr -d ' ')"
  trace "[recovery-process] stage=function-ready state=timeout log_bytes=$log_bytes log_hash=$(file_hash "$FUNCTION_LOG")"
  fail "country-auth local server did not become ready"
fi

stage "country-fixture"
log "Creating disposable local country accounts"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.countries (id, name, short_code, region)
values
  ('$REAL_COUNTRY_ID'::uuid, 'Recoveryland', 'RCV', 'E2E'),
  ('$NO_RECOVERY_COUNTRY_ID'::uuid, 'No Recovery', 'NRC', 'E2E')
on conflict (id) do update
set name = excluded.name, short_code = excluded.short_code, region = excluded.region;
SQL

stage "auth-user-create"
REAL_USER_ID="$(create_auth_user "$REAL_EMAIL" "Recovery Browser HOD" "$REAL_COUNTRY_ID" "$REAL_USERNAME")"
NO_RECOVERY_USER_ID="$(create_auth_user "$NO_RECOVERY_EMAIL" "No Recovery Browser HOD" "$NO_RECOVERY_COUNTRY_ID" "$NO_RECOVERY_USERNAME")"

stage "country-account-enrich"
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

stage "recovery-classification"
log "Verifying recovery availability contracts"
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery_none"}))')"
trace "[recovery-http] stage=recovery-classification case=no-recovery status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "no-recovery request returned HTTP $HTTP_STATUS"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "False" ]] || fail "country without recovery email did not return recoveryAvailable=false"

# Direct internal-email identifiers must behave the same as their username.
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery-none@country.solaris.invalid"}))')"
trace "[recovery-http] stage=recovery-classification case=internal-email status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "internal-email recovery request returned HTTP $HTTP_STATUS"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "False" ]] || fail "direct internal email bypassed no-recovery detection"

# Unknown identifiers intentionally return the same generic positive envelope as
# recoverable accounts so callers cannot enumerate country accounts.
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"definitely_unknown_country_account"}))')"
trace "[recovery-http] stage=recovery-classification case=unknown status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "unknown recovery request returned HTTP $HTTP_STATUS"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "True" ]] || fail "unknown identifier broke enumeration-safe recovery envelope"

stage "recovery-request"
log "Requesting a real local recovery email"
function_call "$(python3 -c 'import json; print(json.dumps({"action":"recover","identifier":"recovery_real"}))')"
trace "[recovery-http] stage=recovery-request status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "recoverable account request returned HTTP $HTTP_STATUS"
[[ "$(printf '%s' "$HTTP_BODY" | json_field recoveryAvailable)" == "True" ]] || fail "recoverable account did not return recoveryAvailable=true"

stage "mailpit-message"
log "Reading captured recovery email from local Mailpit"
MAIL_HTML=''
for attempt in $(seq 1 30); do
  MAIL_HTML="$(curl -fsS "$MAILPIT_URL/view/latest.html?query=to%3A$REAL_EMAIL" 2>/dev/null || true)"
  if [[ -n "$MAIL_HTML" ]]; then
    trace "[recovery-mailpit] stage=mailpit-message detected=true attempt=$attempt"
    break
  fi
  sleep 1
done
[[ -n "$MAIL_HTML" ]] || fail "Mailpit did not capture the recovery email"

stage "recovery-metadata"
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
trace "[recovery-metadata] stage=recovery-metadata link=present"

stage "redirect-validation"
python3 - "$RECOVERY_LINK" "$LOCAL_RESET_ORIGIN/auth/reset" <<'PY'
import sys, urllib.parse
link = urllib.parse.urlparse(sys.argv[1])
expected = sys.argv[2]
params = urllib.parse.parse_qs(link.query)
redirect = params.get("redirect_to", [""])[0]
if redirect != expected:
    raise SystemExit("recovery email redirect_to mismatch")
PY
trace "[recovery-metadata] stage=redirect-validation redirect=expected-local-reset"

stage "bad-token"
log "Rejecting an invalid recovery token"
INVALID_URL="$API_URL/auth/v1/verify?token=invalid-recovery-token&type=recovery&redirect_to=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("http://127.0.0.1:3000/auth/reset", safe=""))')"
invalid_headers="$(mktemp)"
invalid_body="$(mktemp)"
invalid_status="$(curl -sS -D "$invalid_headers" -o "$invalid_body" -w '%{http_code}' "$INVALID_URL")"
invalid_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); sub(/^[^:]+:[[:space:]]*/, "", $0); print; exit}' "$invalid_headers")"
trace "[recovery-http] stage=bad-token status=$invalid_status"
if (( invalid_status >= 300 && invalid_status < 400 )); then
  [[ "$invalid_location" == *"error"* ]] || fail "invalid recovery token redirected without an error marker"
elif (( invalid_status < 400 )); then
  fail "invalid recovery token unexpectedly succeeded with HTTP $invalid_status"
fi
rm -f "$invalid_headers" "$invalid_body"

stage "valid-session"
log "Redeeming the captured recovery link"
headers="$(mktemp)"
body="$(mktemp)"
verify_status="$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' "$RECOVERY_LINK")"
trace "[recovery-http] stage=valid-session status=$verify_status"
(( verify_status >= 300 && verify_status < 400 )) || { rm -f "$headers" "$body"; fail "recovery link verification returned HTTP $verify_status"; }
LOCATION="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); sub(/^[^:]+:[[:space:]]*/, "", $0); print; exit}' "$headers")"
rm -f "$headers" "$body"
[[ "$LOCATION" == "$LOCAL_RESET_ORIGIN/auth/reset#"* ]] || fail "valid recovery link did not return to local /auth/reset"

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
trace "[recovery-session] stage=valid-session access_token=present"

stage "set-password"
log "Changing the password through canonical country-auth"
set_password_body="$(python3 - "$NEW_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"set-password","password":sys.argv[1]}))
PY
)"
function_call "$set_password_body" "$ACCESS_TOKEN"
trace "[recovery-http] stage=set-password status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "set-password returned HTTP $HTTP_STATUS"
[[ "$(printf '%s' "$HTTP_BODY" | json_field ok)" == "True" ]] || fail "set-password did not return ok=true"

stage "new-signin"
log "Proving the new password signs in through canonical country-auth"
signin_body="$(python3 - "$REAL_USERNAME" "$NEW_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$signin_body"
trace "[recovery-http] stage=new-signin status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "200" ]] || fail "new-password sign-in returned HTTP $HTTP_STATUS"
[[ -n "$(printf '%s' "$HTTP_BODY" | json_field accessToken)" ]] || fail "new-password sign-in did not return accessToken"
[[ -n "$(printf '%s' "$HTTP_BODY" | json_field refreshToken)" ]] || fail "new-password sign-in did not return refreshToken"

stage "old-password-reject"
old_signin_body="$(python3 - "$REAL_USERNAME" "$OLD_PASSWORD" <<'PY'
import json, sys
print(json.dumps({"action":"signin","identifier":sys.argv[1],"password":sys.argv[2]}))
PY
)"
function_call "$old_signin_body"
trace "[recovery-http] stage=old-password-reject status=$HTTP_STATUS category=$(safe_http_category "$HTTP_BODY")"
[[ "$HTTP_STATUS" == "401" ]] || fail "old password still signed in after reset (HTTP $HTTP_STATUS)"

stage "complete"
log "Password recovery rehearsal passed"
