#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-lost-response] %s\n' "$*"; }
fail() { printf '\n[v3-s11-lost-response] FAIL: %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required"
command -v psql >/dev/null 2>&1 || fail "psql is required"
command -v node >/dev/null 2>&1 || fail "Node.js is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing hosted/non-local database rehearsal ($DB_URL)" ;;
esac

EDITION_ID='88000000-0000-4000-8000-000000000011'
SHOW_ID='88000000-0000-4000-8000-000000000012'
OPERATION_ID='88000000-0000-4000-8000-000000000013'
IDEMPOTENCY_KEY='v3-s11-lost-response-jury-close'
TMP_DIR="$(mktemp -d)"
PROXY_PID=''

cleanup_fixture() {
  if [[ -n "$PROXY_PID" ]]; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
    wait "$PROXY_PID" >/dev/null 2>&1 || true
  fi
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL >/dev/null 2>&1 || true
delete from private.v3_domain_event_consumer_receipts
where event_id in (
  select id from private.v3_domain_events
  where operation_id = '$OPERATION_ID'::uuid
     or edition_id = '$EDITION_ID'::uuid
);
delete from private.v3_domain_event_outbox
where event_id in (
  select id from private.v3_domain_events
  where operation_id = '$OPERATION_ID'::uuid
     or edition_id = '$EDITION_ID'::uuid
);
delete from private.v3_domain_events
where operation_id = '$OPERATION_ID'::uuid
   or edition_id = '$EDITION_ID'::uuid;
delete from public.studio2_operation_receipts
where operation_id = '$OPERATION_ID'::uuid
   or idempotency_key = '$IDEMPOTENCY_KEY';
delete from public.editions where id = '$EDITION_ID'::uuid;
SQL
  rm -rf "$TMP_DIR"
}
trap cleanup_fixture EXIT
cleanup_fixture
trap cleanup_fixture EXIT
mkdir -p "$TMP_DIR"

log "Creating isolated real Jury-window R2 fixture"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions (id, name, edition_number, status, slug, published)
values (
  '$EDITION_ID'::uuid,
  'S11 lost response rehearsal',
  987012,
  'draft',
  's11-lost-response-rehearsal',
  false
);
insert into public.shows (id, edition_id, name, kind, sort_order, published)
values (
  '$SHOW_ID'::uuid,
  '$EDITION_ID'::uuid,
  'S11 recovery show',
  'semi-final',
  1,
  false
);
SQL

EXPECTED_VERSION="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select coalesce((select version from public.studio2_jury_window_versions where edition_id='$EDITION_ID'::uuid),0);")"
[[ "$EXPECTED_VERSION" == '0' ]] || fail "fixture did not start at jury-window version 0"

REQUEST_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "p_show_id": "$SHOW_ID",
  "p_status": "closed",
  "p_operation_id": "$OPERATION_ID",
  "p_idempotency_key": "$IDEMPOTENCY_KEY",
  "p_expected_version": int("$EXPECTED_VERSION"),
}, separators=(",", ":")))
PY
)"

PROXY_PORT="$(python3 - <<'PY'
import socket
s=socket.socket()
s.bind(('127.0.0.1',0))
print(s.getsockname()[1])
s.close()
PY
)"
READY_FILE="$TMP_DIR/proxy-ready.json"
PROXY_RESULT="$TMP_DIR/proxy-result.json"

log "Starting loopback proxy that consumes but never forwards the committed response"
V3_DROP_PROXY_UPSTREAM="$API_URL" \
V3_DROP_PROXY_PORT="$PROXY_PORT" \
V3_DROP_PROXY_READY="$READY_FILE" \
V3_DROP_PROXY_RESULT="$PROXY_RESULT" \
node scripts/v3-drop-upstream-response-proxy.mjs &
PROXY_PID=$!

for _ in $(seq 1 100); do
  [[ -f "$READY_FILE" ]] && break
  kill -0 "$PROXY_PID" >/dev/null 2>&1 || fail "response-drop proxy exited before becoming ready"
  sleep 0.05
done
[[ -f "$READY_FILE" ]] || fail "response-drop proxy did not become ready"

CLIENT_BODY="$TMP_DIR/client-body"
CLIENT_STATUS="$TMP_DIR/client-status"
set +e
curl -sS --max-time 20 \
  -o "$CLIENT_BODY" \
  -w '%{http_code}' \
  -X POST "http://127.0.0.1:$PROXY_PORT/rest/v1/rpc/studio2_apply_jury_voting_status" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$REQUEST_BODY" >"$CLIENT_STATUS"
CLIENT_RC=$?
set -e

[[ "$CLIENT_RC" -ne 0 ]] || fail "client unexpectedly received a normal response instead of a transport failure"
wait "$PROXY_PID" || fail "response-drop proxy did not complete cleanly"
PROXY_PID=''
[[ -f "$PROXY_RESULT" ]] || fail "response-drop proxy produced no upstream evidence"

python3 - "$PROXY_RESULT" "$OPERATION_ID" <<'PY'
import json,sys
path,operation_id=sys.argv[1:]
with open(path,encoding='utf-8') as fh:
    evidence=json.load(fh)
if evidence.get('ok') is not True:
    raise SystemExit(f"proxy upstream failed: {evidence}")
if evidence.get('upstreamStatus') != 200:
    raise SystemExit(f"upstream did not complete successfully: {evidence}")
if evidence.get('responseBytes',0) <= 0:
    raise SystemExit(f"proxy did not consume an upstream response body: {evidence}")
body=json.loads(evidence['responseBody'])
if body.get('operationId') != operation_id:
    raise SystemExit(f"upstream response was not the fixture operation: {body}")
PY

log "Verifying the caller lost the response but the canonical mutation committed"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid and idempotency_key='$IDEMPOTENCY_KEY' and command='jury.window.closed' and status='succeeded';")" == '1' ]] \
  || fail "committed R2 operation receipt missing after response loss"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select status from public.jury_voting_windows where show_id='$SHOW_ID'::uuid;")" == 'closed' ]] \
  || fail "canonical Jury window mutation did not commit"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select version from public.studio2_jury_window_versions where edition_id='$EDITION_ID'::uuid;")" == '1' ]] \
  || fail "canonical Jury window version did not advance exactly once"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='jury.closed';")" == '1' ]] \
  || fail "committed Jury close did not emit exactly one canonical DomainEvent"

log "Retrying the exact semantic operation directly after the lost response"
RETRY_BODY="$TMP_DIR/retry-body.json"
RETRY_STATUS="$(curl -sS \
  -o "$RETRY_BODY" \
  -w '%{http_code}' \
  -X POST "$API_URL/rest/v1/rpc/studio2_apply_jury_voting_status" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$REQUEST_BODY")"
[[ "$RETRY_STATUS" == '200' ]] || fail "exact retry returned HTTP $RETRY_STATUS: $(cat "$RETRY_BODY")"

python3 - "$RETRY_BODY" "$OPERATION_ID" <<'PY'
import json,sys
path,operation_id=sys.argv[1:]
with open(path,encoding='utf-8') as fh:
    body=json.load(fh)
if body.get('operationId') != operation_id:
    raise SystemExit(f"retry did not replay the original operation: {body}")
if body.get('previousVersion') != 0 or body.get('version') != 1:
    raise SystemExit(f"retry did not return the original committed version result: {body}")
if body.get('status') != 'closed':
    raise SystemExit(f"retry lost the committed Jury status: {body}")
PY

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid;")" == '1' ]] \
  || fail "exact retry duplicated the canonical operation receipt"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select version from public.studio2_jury_window_versions where edition_id='$EDITION_ID'::uuid;")" == '1' ]] \
  || fail "exact retry re-executed the Jury mutation"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='jury.closed';")" == '1' ]] \
  || fail "exact retry duplicated the canonical Jury DomainEvent"

log "PASS: real R2 response was lost after commit and exact retry replayed durable state without duplicate effects"
