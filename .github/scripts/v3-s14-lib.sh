#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-full-contest] %s\n' "$*"; }
fail() {
  printf '\n[v3-s14-full-contest] FAIL: %s\n' "$*" >&2
  if declare -F s14_connection_snapshot >/dev/null 2>&1 && [[ "${DB_READY:-0}" == "1" ]]; then
    s14_connection_snapshot "failure:${CURRENT_STAGE:-bootstrap}" detailed || true
  fi
  exit 1
}

# S14 is destructive by design, therefore it is permanently local-only.
# Never add a hosted fallback. A broken local stack must fail the rehearsal.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing S14 against non-local API_URL=$API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "refusing S14 against non-local DB_URL" ;;
esac

export SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL"
export VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL"
export SUPABASE_PROJECT_ID=local
export SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local
export E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local
export VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local
export V3_SEED_TARGET=local
export V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1
export V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

HEAD_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
CANDIDATE_SHA="${V3_CANDIDATE_SHA:-}"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || fail "V3_CANDIDATE_SHA must be an exact 40-character commit SHA"
CANDIDATE_SHA="$(printf '%s' "$CANDIDATE_SHA" | tr '[:upper:]' '[:lower:]')"
[[ "$CANDIDATE_SHA" == "$HEAD_SHA" ]] || fail "candidate SHA $CANDIDATE_SHA does not match checked-out HEAD $HEAD_SHA"

for attempt in {1..20}; do
  if PGAPPNAME='solaris-s14-bootstrap' psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c 'select 1' 2>/dev/null | grep -qx '1'; then
    DB_READY=1
    break
  fi
  sleep 1
done
[[ "${DB_READY:-0}" == "1" ]] || fail "local database did not become ready"

EDITION_ID='14000000-0000-4000-8000-000000000001'
SEMI_ONE_ID='14000000-0000-4000-8000-000000000011'
SEMI_TWO_ID='14000000-0000-4000-8000-000000000012'
FINAL_ID='14000000-0000-4000-8000-000000000013'
CONFIRMATION_ROUND_ID='14000000-0000-4000-8000-000000000021'
LATE_ROUND_ID='14000000-0000-4000-8000-000000000022'
TV_EDITION_ID='14000000-0000-4000-8000-000000000031'
TV_ROUND_ID='14000000-0000-4000-8000-000000000032'
RULEBOOK_ID='14000000-0000-4000-8000-000000000041'
STORYLINE_ID='14000000-0000-4000-8000-000000000051'
PASSWORD='S14-Local-Contest-Only-Aa9!'

HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''
LAST_TOKEN=''

S14_CONNECTION_DIAGNOSTICS_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
S14_CONNECTION_DIAGNOSTICS_LOG="$S14_CONNECTION_DIAGNOSTICS_DIR/s14-connection-diagnostics.log"
S14_CONNECTION_CHECKPOINT_FILE="$S14_CONNECTION_DIAGNOSTICS_DIR/.s14-last-connection-checkpoint"
S14_DIAGNOSTIC_RUNNING=0

s14_pg_app_name() {
  local stage="${CURRENT_STAGE:-bootstrap}"
  stage="${stage//:/-}"
  printf 'solaris-s14-%.48s' "$stage"
}

s14_connection_snapshot() {
  local label="${1:-unspecified}" mode="${2:-summary}" output
  [[ "${DB_READY:-0}" == "1" ]] || return 0
  [[ "${S14_DIAGNOSTIC_RUNNING:-0}" != "1" ]] || return 0
  S14_DIAGNOSTIC_RUNNING=1
  mkdir -p "$S14_CONNECTION_DIAGNOSTICS_DIR"
  output="$(mktemp)"
  {
    printf '\n=== S14 CONNECTION SNAPSHOT %s ===\n' "$label"
    printf 'utc=%s current_stage=%s candidate_sha=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${CURRENT_STAGE:-bootstrap}" "$CANDIDATE_SHA"
    PGAPPNAME='solaris-s14-diagnostics' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -P pager=off -c "
select
  current_database() as database,
  pg_postmaster_start_time() as postmaster_started_at,
  current_setting('max_connections')::int as max_connections,
  current_setting('superuser_reserved_connections')::int as superuser_reserved_connections,
  count(*) filter (where backend_type='client backend') as client_backends,
  count(*) filter (where backend_type='client backend' and state='active') as active_clients,
  count(*) filter (where backend_type='client backend' and state='idle') as idle_clients,
  count(*) filter (where backend_type='client backend' and state like 'idle in transaction%') as idle_in_transaction_clients
from pg_stat_activity
where datname=current_database();
" || true
    PGAPPNAME='solaris-s14-diagnostics' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -P pager=off -c "
select
  coalesce(usename,'<none>') as usename,
  coalesce(nullif(application_name,''),'<none>') as application_name,
  coalesce(client_addr::text,'local') as client_addr,
  backend_type,
  coalesce(state,'<none>') as state,
  coalesce(wait_event_type,'<none>') as wait_event_type,
  coalesce(wait_event,'<none>') as wait_event,
  count(*) as connections
from pg_stat_activity
where datname=current_database()
  and pid <> pg_backend_pid()
group by usename, application_name, client_addr, backend_type, state, wait_event_type, wait_event
order by connections desc, application_name, usename;
" || true
    if [[ "$mode" == "detailed" ]]; then
      PGAPPNAME='solaris-s14-diagnostics' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -P pager=off -c "
select
  pid,
  coalesce(usename,'<none>') as usename,
  coalesce(nullif(application_name,''),'<none>') as application_name,
  coalesce(client_addr::text,'local') as client_addr,
  backend_type,
  coalesce(state,'<none>') as state,
  backend_start,
  xact_start,
  query_start,
  state_change,
  coalesce(wait_event_type,'<none>') as wait_event_type,
  coalesce(wait_event,'<none>') as wait_event,
  pg_blocking_pids(pid) as blocking_pids,
  regexp_replace(left(coalesce(query,''),160), E'[\\n\\r\\t ]+', ' ', 'g') as query_excerpt
from pg_stat_activity
where datname=current_database()
  and pid <> pg_backend_pid()
order by backend_start, pid;
" || true
    fi
  } >"$output" 2>&1
  cat "$output" | tee -a "$S14_CONNECTION_DIAGNOSTICS_LOG" >&2
  rm -f "$output"
  S14_DIAGNOSTIC_RUNNING=0
}

s14_connection_checkpoint() {
  local checkpoint="${CURRENT_STAGE:-bootstrap}" previous=''
  [[ "${DB_READY:-0}" == "1" ]] || return 0
  [[ "${S14_DIAGNOSTIC_RUNNING:-0}" != "1" ]] || return 0
  mkdir -p "$S14_CONNECTION_DIAGNOSTICS_DIR"
  if [[ -f "$S14_CONNECTION_CHECKPOINT_FILE" ]]; then
    previous="$(cat "$S14_CONNECTION_CHECKPOINT_FILE" 2>/dev/null || true)"
  fi
  if [[ "$checkpoint" != "$previous" ]]; then
    s14_connection_snapshot "checkpoint:$checkpoint" summary || true
    printf '%s\n' "$checkpoint" > "$S14_CONNECTION_CHECKPOINT_FILE"
  fi
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value = value[int(key)] if isinstance(value, list) else value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

db_exec() {
  s14_connection_checkpoint
  PGAPPNAME="$(s14_pg_app_name)" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null
}

db_scalar() {
  s14_connection_checkpoint
  PGAPPNAME="$(s14_pg_app_name)" psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

rpc_request() {
  local token="$1" function_name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$token" "$ANON_KEY" "$body"
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

expect_json() {
  local label="$1" path="$2" expected="$3" actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got '$actual' from $HTTP_BODY"
  log "PASS: $label"
}

create_user() {
  local email="$1" display_name="$2" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True,"user_metadata":{"display_name":sys.argv[3]}}))' "$email" "$PASSWORD" "$display_name")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  if (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
    LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  else
    s14_connection_checkpoint
    LAST_USER_ID="$(PGAPPNAME="$(s14_pg_app_name)" psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -v email="$email" -c "select id from auth.users where lower(email)=lower(:'email') limit 1;")"
    [[ -n "$LAST_USER_ID" ]] || fail "could not create or recover local user $email (HTTP $HTTP_STATUS)"
  fi
  [[ -n "$LAST_USER_ID" ]] || fail "local auth user $email has no id"
}

sign_in() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$LAST_TOKEN" ]] || fail "sign-in response for $email had no access token"
}

country_uuid_sql="('14000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid"
participant_uuid_sql="('14000000-0000-4001-8000-' || lpad(i::text, 12, '0'))::uuid"

s14_connection_snapshot 'baseline:local-supabase-ready' summary || true
