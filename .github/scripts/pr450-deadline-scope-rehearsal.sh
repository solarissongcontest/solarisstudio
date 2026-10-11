#!/usr/bin/env bash
set -euo pipefail

fail() { printf '\n[deadline-scope] FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf '[deadline-scope] PASS: %s\n' "$*"; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='DeadlineScope2026!'
EDITION_ID='00000000-0000-4000-8000-00000000d450'
SHOW_ID='00000000-0000-4000-8000-00000000d451'
DEADLINE_ID='00000000-0000-4000-8000-00000000d452'

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value = value[int(key)] if isinstance(value, list) else value[key]
print("" if value is None else value)
' "$path"
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" body="${5-}"
  local out
  out="$(mktemp)"
  local args=(-sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json')
  [[ -n "$body" ]] && args+=(--data "$body")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$out")"
  rm -f "$out"
}

create_user_and_token() {
  local email="$1"
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$payload"
  [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]] || fail "create $email returned HTTP $HTTP_STATUS: $HTTP_BODY"
  CREATED_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  [[ -n "$CREATED_USER_ID" ]] || fail "create $email returned no id"
  payload="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$payload"
  [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]] || fail "sign in $email returned HTTP $HTTP_STATUS: $HTTP_BODY"
  CREATED_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$CREATED_TOKEN" ]] || fail "sign in $email returned no token"
}

create_user_and_token deadline-scoped@solaris.invalid
SCOPED_USER_ID="$CREATED_USER_ID"
SCOPED_TOKEN="$CREATED_TOKEN"
create_user_and_token deadline-denied@solaris.invalid
DENIED_TOKEN="$CREATED_TOKEN"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','Deadline scope rehearsal','deadline-scope-rehearsal',9450,'draft',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published)
values ('$SHOW_ID','$EDITION_ID','Scoped show','semi-final',1,false);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$SCOPED_USER_ID'::uuid,'edition.manage','$EDITION_ID'::uuid);
insert into public.admin_deadlines(id,edition_id,show_id,kind,label,due_at)
values ('$DEADLINE_ID',null,'$SHOW_ID','reminder','Scoped reminder',now() + interval '1 day');
SQL

request GET "$API_URL/rest/v1/admin_deadlines?select=id,edition_id,show_id,label&id=eq.$DEADLINE_ID" "$SCOPED_TOKEN" "$ANON_KEY"
[[ "$HTTP_STATUS" == "200" ]] || fail "scoped reminder read returned HTTP $HTTP_STATUS: $HTTP_BODY"
SCOPED_ID="$(printf '%s' "$HTTP_BODY" | json_value 0.id 2>/dev/null || true)"
[[ "$SCOPED_ID" == "$DEADLINE_ID" ]] || fail "edition-scoped Organizer could not see show-only reminder: $HTTP_BODY"
pass "edition-scoped Organizer sees show-only reminder through show scope"

request GET "$API_URL/rest/v1/admin_deadlines?select=id&id=eq.$DEADLINE_ID" "$DENIED_TOKEN" "$ANON_KEY"
[[ "$HTTP_STATUS" == "200" ]] || fail "denied reminder read returned HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$HTTP_BODY" == "[]" ]] || fail "unprivileged user saw show-only reminder: $HTTP_BODY"
pass "unprivileged authenticated user cannot see show-only reminder"

request PATCH "$API_URL/rest/v1/admin_deadlines?id=eq.$DEADLINE_ID" "$SCOPED_TOKEN" "$ANON_KEY" '{"label":"Scoped reminder updated"}'
[[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]] || fail "scoped reminder update returned HTTP $HTTP_STATUS: $HTTP_BODY"
UPDATED_LABEL="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select label from public.admin_deadlines where id='$DEADLINE_ID'::uuid;")"
[[ "$UPDATED_LABEL" == "Scoped reminder updated" ]] || fail "scoped update did not persist: $UPDATED_LABEL"
pass "edition-scoped Organizer can update show-only reminder"
