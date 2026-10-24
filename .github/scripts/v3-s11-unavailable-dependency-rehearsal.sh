#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-dependency] %s\n' "$*"; }
fail() { printf '\n[v3-s11-dependency] FAIL: %s\n' "$*" >&2; exit 1; }

for command_name in supabase psql curl python3 git; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

: "${V3_S11_DEPENDENCY_SHA:?V3_S11_DEPENDENCY_SHA is required}"
EVIDENCE_SHA="$(printf '%s' "$V3_S11_DEPENDENCY_SHA" | tr '[:upper:]' '[:lower:]')"
[[ "$EVIDENCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "V3_S11_DEPENDENCY_SHA must be an exact 40-character commit SHA"
CHECKOUT_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
[[ "$CHECKOUT_SHA" == "$EVIDENCE_SHA" ]] \
  || fail "V3_S11_DEPENDENCY_SHA $EVIDENCE_SHA does not match checked-out commit $CHECKOUT_SHA"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] \
  || fail "exact-SHA evidence requires a clean worktree, including no untracked files"
OUTPUT_PATH="${V3_S11_DEPENDENCY_OUTPUT:-}"

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

PREEXISTING_ACTIONABLE="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  where delivery.consumer_key='jury.tasks'
    and not exists (
      select 1
      from private.v3_domain_event_consumer_receipts receipt
      where receipt.event_id=delivery.event_id
        and receipt.consumer_key=delivery.consumer_key
    )
    and (
      (delivery.status='pending' and delivery.available_at <= now())
      or (delivery.status='processing' and delivery.lease_expires_at <= now())
    );
")"
[[ "$PREEXISTING_ACTIONABLE" == '0' ]] \
  || fail "isolated local database already has $PREEXISTING_ACTIONABLE actionable jury.tasks deliveries; reset it before this rehearsal"

read -r EDITION_ID SHOW_ID OPERATION_ID < <(
  python3 - <<'PY'
import uuid
print(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
PY
)
EDITION_NUMBER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select coalesce(max(edition_number),0) + 100002 from public.editions;")"
EDITION_SLUG="s11-dependency-${EDITION_ID%%-*}"
IDEMPOTENCY_KEY="v3-s11-dependency-$OPERATION_ID"
WORKER_ID="v3-s11-dependency-${EDITION_ID%%-*}"
TMP_DIR="$(mktemp -d)"
DEPENDENCY_DIR="$TMP_DIR/dependency"
DEPENDENCY_PID=''
OUTAGE_CURL_RC=''
mkdir -p "$DEPENDENCY_DIR"
printf 'ok\n' > "$DEPENDENCY_DIR/health"

cleanup_local_processes() {
  if [[ -n "$DEPENDENCY_PID" ]]; then
    kill "$DEPENDENCY_PID" >/dev/null 2>&1 || true
    wait "$DEPENDENCY_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup_local_processes EXIT

DEPENDENCY_PORT="$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    print(sock.getsockname()[1])
PY
)"
DEPENDENCY_URL="http://127.0.0.1:$DEPENDENCY_PORT/health"

start_dependency() {
  python3 -m http.server "$DEPENDENCY_PORT" \
    --bind 127.0.0.1 \
    --directory "$DEPENDENCY_DIR" \
    >"$TMP_DIR/dependency.log" 2>&1 &
  DEPENDENCY_PID=$!
  for _ in $(seq 1 100); do
    if curl --fail --silent --show-error --max-time 1 "$DEPENDENCY_URL" >/dev/null 2>&1; then
      return 0
    fi
    kill -0 "$DEPENDENCY_PID" >/dev/null 2>&1 || fail "loopback dependency exited before becoming ready"
    sleep 0.05
  done
  fail "loopback dependency did not become ready"
}

stop_dependency() {
  [[ -n "$DEPENDENCY_PID" ]] || return 0
  kill "$DEPENDENCY_PID" >/dev/null 2>&1 || true
  wait "$DEPENDENCY_PID" >/dev/null 2>&1 || true
  DEPENDENCY_PID=''
}

claim_fixture_delivery() {
  local claimed
  claimed="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    set \"request.jwt.claim.role\"='service_role';
    select event_id::text
    from public.studio2_claim_domain_event_deliveries(
      'jury.tasks', '$WORKER_ID', 1, 60
    );
  ")"
  [[ "$claimed" == "$EVENT_ID" ]] \
    || fail "canonical claim did not return the isolated fixture event (expected $EVENT_ID, got ${claimed:-<none>})"
}

fail_claim_for_dependency() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    set \"request.jwt.claim.role\"='service_role';
    select public.studio2_fail_domain_event_delivery(
      '$EVENT_ID'::uuid,
      'jury.tasks',
      '$WORKER_ID',
      'DEPENDENCY_FAILURE',
      jsonb_build_object(
        'dependency', 'loopback-http-health',
        'endpoint', '$DEPENDENCY_URL',
        'probeExitCode', $OUTAGE_CURL_RC
      ),
      0,
      5
    );
  " >/dev/null
}

process_claim_with_dependency() {
  curl --fail --silent --show-error --max-time 1 "$DEPENDENCY_URL" >/dev/null
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    set \"request.jwt.claim.role\"='service_role';
    select public.studio2_process_jury_domain_event(
      '$EVENT_ID'::uuid,
      'jury.tasks',
      '$WORKER_ID'
    );
  " >/dev/null
}

log "Creating isolated governed Jury event fixture"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions (id, name, edition_number, status, slug, published)
values (
  '$EDITION_ID'::uuid,
  'S11 unavailable dependency rehearsal',
  $EDITION_NUMBER,
  'draft',
  '$EDITION_SLUG',
  false
);
insert into public.shows (id, edition_id, name, kind, sort_order, published)
values (
  '$SHOW_ID'::uuid,
  '$EDITION_ID'::uuid,
  'S11 dependency recovery show',
  'semi-final',
  1,
  false
);
SQL

REQUEST_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "p_show_id": "$SHOW_ID",
  "p_status": "closed",
  "p_operation_id": "$OPERATION_ID",
  "p_idempotency_key": "$IDEMPOTENCY_KEY",
  "p_expected_version": 0,
}, separators=(",", ":")))
PY
)"
FIXTURE_BODY="$TMP_DIR/fixture.json"
FIXTURE_STATUS="$(curl -sS -o "$FIXTURE_BODY" -w '%{http_code}' \
  -X POST "$API_URL/rest/v1/rpc/studio2_apply_jury_voting_status" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$REQUEST_BODY")"
[[ "$FIXTURE_STATUS" == '200' ]] || fail "governed fixture operation returned HTTP $FIXTURE_STATUS: $(cat "$FIXTURE_BODY")"

EVENT_ID="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select id::text
  from private.v3_domain_events
  where operation_id='$OPERATION_ID'::uuid
    and event_type='jury.closed';
")"
[[ "$EVENT_ID" =~ ^[0-9a-f-]{36}$ ]] || fail "governed fixture did not create the canonical jury.closed event"

log "Starting the real loopback HTTP dependency and claiming the canonical delivery"
start_dependency
claim_fixture_delivery

log "Making the real dependency unavailable"
stop_dependency
set +e
curl --fail --silent --show-error --max-time 1 "$DEPENDENCY_URL" >/dev/null 2>&1
OUTAGE_CURL_RC=$?
set -e
[[ "$OUTAGE_CURL_RC" -ne 0 ]] || fail "dependency outage injection failed; health probe still succeeded"

log "Recording the observed outage through the canonical DomainEvent failure contract"
fail_claim_for_dependency

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox
  where event_id='$EVENT_ID'::uuid
    and consumer_key='jury.tasks'
    and status='pending'
    and last_error_code='DEPENDENCY_FAILURE'
    and last_error_metadata->>'dependency'='loopback-http-health'
    and completed_at is null
    and dead_lettered_at is null;
")" == '1' ]] || fail "canonical outbox did not retain the dependency-classified retry state"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_consumer_receipts
  where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';
")" == '0' ]] || fail "consumer receipt appeared even though the dependency was unavailable"

log "Restoring the same dependency endpoint and retrying the canonical delivery"
start_dependency
claim_fixture_delivery
process_claim_with_dependency

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_consumer_receipts
  where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';
")" == '1' ]] || fail "recovered consumer did not converge on exactly one immutable receipt"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox
  where event_id='$EVENT_ID'::uuid
    and consumer_key='jury.tasks'
    and status='completed'
    and attempt_count=2
    and dead_lettered_at is null;
")" == '1' ]] || fail "recovered delivery did not complete after exactly one failed attempt and one retry"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_events
  where operation_id='$OPERATION_ID'::uuid and event_type='jury.closed';
")" == '1' ]] || fail "recovery duplicated or lost the canonical DomainEvent"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  where delivery.event_id='$EVENT_ID'::uuid
    and delivery.consumer_key='jury.tasks'
    and delivery.last_error_code='DEPENDENCY_FAILURE';
")" == '1' ]] || fail "recovery discarded the retained dependency failure evidence"

if [[ -n "$OUTPUT_PATH" ]]; then
  mkdir -p "$(dirname "$OUTPUT_PATH")"
  python3 - "$OUTPUT_PATH" <<PY
import json, sys
path=sys.argv[1]
with open(path, 'w', encoding='utf-8') as fh:
    json.dump({
        'schemaVersion': 1,
        'commitSha': '$EVIDENCE_SHA',
        'environment': 'local-supabase',
        'dependency': {
            'kind': 'loopback-http-health',
            'url': '$DEPENDENCY_URL',
            'outageProbeExitCode': int('$OUTAGE_CURL_RC'),
            'restored': True,
        },
        'eventId': '$EVENT_ID',
        'operationId': '$OPERATION_ID',
        'errorCode': 'DEPENDENCY_FAILURE',
        'attemptCount': 2,
        'consumerReceipts': 1,
        'certificationClaim': False,
        'productionTrafficRequired': False,
    }, fh, indent=2)
    fh.write('\n')
PY
fi

log "PASS: a real loopback dependency became unavailable, canonical DEPENDENCY_FAILURE retry state was retained, and restored delivery converged exactly once"
log "Fixture ledger rows are intentionally left in this disposable local database because S4 ledgers are immutable; reset local Supabase after retaining evidence."
