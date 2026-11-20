#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-show-lifecycle] %s\n' "$*"; }
fail() { printf '\n[v3-show-lifecycle] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3ShowLifecycle2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  if [[ -n "$data" ]]; then
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json' --data "$data")"
  else
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" -H "Authorization: Bearer $bearer" \
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
expect_conflict() {
  local label="$1"
  [[ "$HTTP_STATUS" == "409" ]] || fail "$label expected HTTP 409, got $HTTP_STATUS: $HTTP_BODY"
  [[ "$HTTP_BODY" == *"VERSION_CONFLICT"* || "$HTTP_BODY" == *"STATE_CHANGED"* ]] || fail "$label returned a non-canonical conflict: $HTTP_BODY"
  log "PASS: $label rejected with canonical conflict"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
rpc() { request POST "$API_URL/rest/v1/rpc/$2" "$1" "$ANON_KEY" "$3"; }

create_user() {
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"email\":\"show-lifecycle@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
  expect_success "create isolated Show lifecycle actor"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$HTTP_BODY"
}
sign_in() {
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
    "{\"email\":\"show-lifecycle@solaris.invalid\",\"password\":\"$PASSWORD\"}"
  expect_success "sign in isolated Show lifecycle actor"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$HTTP_BODY"
}
jwt_claim() {
  python3 - "$1" "$2" <<'PY'
import base64,json,sys
part=sys.argv[1].split('.')[1]
part += '=' * (-len(part) % 4)
value=json.loads(base64.urlsafe_b64decode(part.encode())).get(sys.argv[2])
print('' if value is None else value)
PY
}

EDITION_ID='00000000-0000-4000-8000-00000000d601'
UNAUTH_OP='00000000-0000-4000-8000-00000000d602'
CREATE_OP='00000000-0000-4000-8000-00000000d603'
STALE_UPDATE_OP='00000000-0000-4000-8000-00000000d604'
UPDATE_OP='00000000-0000-4000-8000-00000000d605'
MODE_OP='00000000-0000-4000-8000-00000000d606'
STALE_DELETE_OP='00000000-0000-4000-8000-00000000d607'
BLOCKED_DELETE_OP='00000000-0000-4000-8000-00000000d608'
DELETE_OP='00000000-0000-4000-8000-00000000d609'

log "Seed isolated edition and real local Auth actor"
db_exec "insert into public.editions(id,name,slug,edition_number,year,status,published) values ('$EDITION_ID','V3 Show Lifecycle Rehearsal','v3-show-lifecycle-rehearsal',9601,2026,'active',false) on conflict (id) do update set status='active',published=false;"
USER_ID="$(create_user | tail -n1)"
TOKEN="$(sign_in | tail -n1)"
SESSION_ID="$(jwt_claim "$TOKEN" session_id)"
[[ -n "$USER_ID" && -n "$TOKEN" && -n "$SESSION_ID" ]] || fail "Local Auth did not produce actor/session identity"
[[ "$(db_value "select count(*) from auth.sessions where id='$SESSION_ID'::uuid and user_id='$USER_ID'::uuid;")" == "1" ]] || fail "Signed-in actor lacks an active Auth session"

log "Server-side authorization rejects actor before edition.manage is granted"
rpc "$TOKEN" studio2_create_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_name\":\"Unauthorized Show\",\"p_kind\":\"semi-final\",\"p_sort_order\":1,\"p_publication_config\":{},\"p_operation_id\":\"$UNAUTH_OP\",\"p_idempotency_key\":\"show-unauthorized\",\"p_correlation_id\":\"$UNAUTH_OP\"}"
expect_failure "unauthorized Show create"
[[ "$(db_value "select count(*) from public.shows where edition_id='$EDITION_ID'::uuid;")" == "0" ]] || fail "Unauthorized create mutated Show state"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$UNAUTH_OP'::uuid;")" == "0" ]] || fail "Authorization rejection persisted a receipt"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_ID','edition.manage','$EDITION_ID') on conflict (user_id,capability,edition_id) do nothing;"

log "Governed create commits version 1 with one receipt and one event"
rpc "$TOKEN" studio2_create_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_name\":\"Rehearsal Semi-Final\",\"p_kind\":\"semi-final\",\"p_sort_order\":1,\"p_publication_config\":{},\"p_operation_id\":\"$CREATE_OP\",\"p_idempotency_key\":\"show-create\",\"p_correlation_id\":\"$CREATE_OP\"}"
expect_success "governed Show create"
read -r SHOW_ID CREATE_VERSION < <(python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); assert r['status']=='succeeded' and r['replayed'] is False
result=r['result']; assert result['ok'] is True and result['stateVersion']==1
print(result['showId'], result['stateVersion'])
PY
)
[[ "$CREATE_VERSION" == "1" ]] || fail "Create did not expose version 1"
[[ "$(db_value "select version from public.shows where id='$SHOW_ID'::uuid;")" == "1" ]] || fail "Created Show version is not 1"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$CREATE_OP'::uuid and status='succeeded';")" == "1" ]] || fail "Create receipt missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$CREATE_OP'::uuid and event_type='show.changed' and aggregate_version=1;")" == "1" ]] || fail "Create event missing"

log "Exact create retry reconciles instead of duplicating state"
rpc "$TOKEN" studio2_create_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_name\":\"Rehearsal Semi-Final\",\"p_kind\":\"semi-final\",\"p_sort_order\":1,\"p_publication_config\":{},\"p_operation_id\":\"$CREATE_OP\",\"p_idempotency_key\":\"show-create\",\"p_correlation_id\":\"$CREATE_OP\"}"
expect_success "exact create replay"
python3 - "$HTTP_BODY" "$SHOW_ID" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); assert r['status']=='succeeded' and r['replayed'] is True
assert r['result']['showId']==sys.argv[2] and r['result']['stateVersion']==1
PY
[[ "$(db_value "select count(*) from public.shows where edition_id='$EDITION_ID'::uuid;")" == "1" ]] || fail "Create replay duplicated Show"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$CREATE_OP'::uuid and event_type='show.changed';")" == "1" ]] || fail "Create replay duplicated event"

log "Preflight exposes exact version and initially safe deletion state"
rpc "$TOKEN" studio2_show_lifecycle_preview "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_success "Show lifecycle preview"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); assert p['expectedVersion']==1
assert p['show']['name']=='Rehearsal Semi-Final'; assert p['delete']['allowed'] is True
assert p['dependencies']['blockingReferenceCount']==0 and p['delete']['riskClass']=='R3'
PY

log "Stale update is a deterministic conflict and rolls back its claim"
rpc "$TOKEN" studio2_update_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_name\":\"Stale Update\",\"p_kind\":\"semi-final\",\"p_sort_order\":2,\"p_expected_version\":99,\"p_operation_id\":\"$STALE_UPDATE_OP\",\"p_idempotency_key\":\"show-stale-update\",\"p_correlation_id\":\"$STALE_UPDATE_OP\"}"
expect_conflict "stale Show update"
[[ "$(db_value "select name from public.shows where id='$SHOW_ID'::uuid;")" == "Rehearsal Semi-Final" ]] || fail "Stale update changed Show"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$STALE_UPDATE_OP'::uuid;")" == "0" ]] || fail "Rolled-back stale update left a receipt"

log "Governed identity update advances version 2 and event 2"
rpc "$TOKEN" studio2_update_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_name\":\"Rehearsal Grand Final\",\"p_kind\":\"grand-final\",\"p_sort_order\":2,\"p_expected_version\":1,\"p_operation_id\":\"$UPDATE_OP\",\"p_idempotency_key\":\"show-update\",\"p_correlation_id\":\"$UPDATE_OP\"}"
expect_success "governed Show update"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); assert r['status']=='succeeded' and r['result']['stateVersion']==2
PY
[[ "$(db_value "select version from public.shows where id='$SHOW_ID'::uuid;")" == "2" ]] || fail "Show update did not advance version 2"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$UPDATE_OP'::uuid and event_type='show.changed' and aggregate_version=2;")" == "1" ]] || fail "Update event missing"

log "Show Mode is server-timestamped and advances version 3"
rpc "$TOKEN" studio2_update_show_mode_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_phase\":\"live\",\"p_scheduled_start\":null,\"p_youtube_url\":\"https://www.youtube.com/watch?v=solaris-rehearsal\",\"p_televote_round_id\":null,\"p_expected_version\":2,\"p_operation_id\":\"$MODE_OP\",\"p_idempotency_key\":\"show-mode\",\"p_correlation_id\":\"$MODE_OP\"}"
expect_success "governed Show Mode update"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); result=r['result']; assert result['stateVersion']==3
m=result['showMode']; assert m['phase']=='live' and m['liveStartedAt'] is not None
assert m['resultsStartedAt'] is None and m['endedAt'] is None
PY
[[ "$(db_value "select version from public.shows where id='$SHOW_ID'::uuid;")" == "3" ]] || fail "Show Mode did not advance version 3"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$MODE_OP'::uuid and event_type='show.changed' and aggregate_version=3;")" == "1" ]] || fail "Show Mode event missing"

log "Compatibility writer advances CAS even when it does not emit a governed event"
db_exec "update public.shows set name=name where id='$SHOW_ID'::uuid;"
[[ "$(db_value "select version from public.shows where id='$SHOW_ID'::uuid;")" == "4" ]] || fail "Compatibility update did not advance version 4"

log "Catalog-derived deletion discovers a newly introduced FK without hard-coded code changes"
db_exec "create table public.v3_show_lifecycle_rehearsal_dependency (id uuid primary key default gen_random_uuid(), show_id uuid not null references public.shows(id) on delete cascade); insert into public.v3_show_lifecycle_rehearsal_dependency(show_id) values ('$SHOW_ID');"
rpc "$TOKEN" studio2_show_lifecycle_preview "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_success "dependency-aware deletion preflight"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); assert p['expectedVersion']==4
assert p['delete']['allowed'] is False and 'dependent_records_exist' in p['delete']['blockers']
assert p['dependencies']['blockingReferenceCount']>=1
assert any(k.endswith('v3_show_lifecycle_rehearsal_dependency.show_id') for k in p['dependencies']['tables'])
PY

log "R3 delete rejects both stale version and current dependency state"
rpc "$TOKEN" studio2_delete_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_version\":3,\"p_reason\":\"Runtime stale delete proof\",\"p_operation_id\":\"$STALE_DELETE_OP\",\"p_idempotency_key\":\"show-stale-delete\",\"p_correlation_id\":\"$STALE_DELETE_OP\"}"
expect_conflict "stale R3 Show delete"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$STALE_DELETE_OP'::uuid;")" == "0" ]] || fail "Rolled-back stale delete left a receipt"
rpc "$TOKEN" studio2_delete_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_version\":4,\"p_reason\":\"Runtime dependency block proof\",\"p_operation_id\":\"$BLOCKED_DELETE_OP\",\"p_idempotency_key\":\"show-blocked-delete\",\"p_correlation_id\":\"$BLOCKED_DELETE_OP\"}"
expect_conflict "dependency-blocked R3 Show delete"
[[ "$HTTP_BODY" == *"STATE_CHANGED"* ]] || fail "Dependency block did not return STATE_CHANGED"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$BLOCKED_DELETE_OP'::uuid;")" == "0" ]] || fail "Rolled-back dependency delete left a receipt"
[[ "$(db_value "select count(*) from public.shows where id='$SHOW_ID'::uuid;")" == "1" ]] || fail "Blocked delete removed Show"

db_exec "drop table public.v3_show_lifecycle_rehearsal_dependency;"
rpc "$TOKEN" studio2_show_lifecycle_preview "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_success "final deletion preflight"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
p=json.loads(sys.argv[1]); assert p['expectedVersion']==4
assert p['delete']['allowed'] is True and p['dependencies']['blockingReferenceCount']==0
PY

log "Fresh-authenticated delete persists protected R3 receipt evidence and tombstone event 5"
rpc "$TOKEN" studio2_delete_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_version\":4,\"p_reason\":\"Runtime rehearsal cleanup\",\"p_operation_id\":\"$DELETE_OP\",\"p_idempotency_key\":\"show-delete\",\"p_correlation_id\":\"$DELETE_OP\"}"
expect_success "governed R3 Show delete"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); assert r['status']=='succeeded' and r['replayed'] is False
assert r['result']['deleted'] is True and r['result']['stateVersion']==4
PY
[[ "$(db_value "select count(*) from public.shows where id='$SHOW_ID'::uuid;")" == "0" ]] || fail "Governed delete did not remove Show"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$DELETE_OP'::uuid and status='succeeded' and actor_session_id='$SESSION_ID' and auth_freshness_evidence->>'fresh'='true';")" == "1" ]] || fail "Delete receipt lacks fresh active-session evidence"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$DELETE_OP'::uuid and event_type='show.changed' and aggregate_version=5 and show_id is null;")" == "1" ]] || fail "Delete tombstone event version 5 missing"

log "Delete replay succeeds after the Show row is gone and does not duplicate evidence"
rpc "$TOKEN" studio2_delete_show_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_version\":4,\"p_reason\":\"Runtime rehearsal cleanup\",\"p_operation_id\":\"$DELETE_OP\",\"p_idempotency_key\":\"show-delete\",\"p_correlation_id\":\"$DELETE_OP\"}"
expect_success "exact Show delete replay"
python3 - "$HTTP_BODY" <<'PY'
import json,sys
r=json.loads(sys.argv[1]); assert r['status']=='succeeded' and r['replayed'] is True
assert r['result']['deleted'] is True
PY
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$DELETE_OP'::uuid and event_type='show.changed';")" == "1" ]] || fail "Delete replay duplicated tombstone event"

log "Audit and event provenance remains complete across the compatibility-version gap"
[[ "$(db_value "select count(*) from public.admin_audit_log where actor_id='$USER_ID'::uuid and edition_id='$EDITION_ID'::uuid and action in ('show_created','show_updated','show_mode_updated','show_deleted');")" == "4" ]] || fail "Show lifecycle audit evidence incomplete"
EVENT_VERSIONS="$(db_value "select string_agg(aggregate_version::text,',' order by aggregate_version) from private.v3_domain_events where aggregate_type='show' and aggregate_id='$SHOW_ID' and event_type='show.changed';")"
[[ "$EVENT_VERSIONS" == "1,2,3,5" ]] || fail "Unexpected Show event versions: $EVENT_VERSIONS"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='show' and aggregate_id='$SHOW_ID' and event_type='show.changed' and show_id is not null;")" == "0" ]] || fail "Show lifecycle event created a deletion-blocking Show FK"

log "System V3 governed Show lifecycle runtime rehearsal passed"
