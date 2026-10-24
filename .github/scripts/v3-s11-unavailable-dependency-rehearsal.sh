#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-dependency-outage] %s\n' "$*"; }
fail() { printf '\n[v3-s11-dependency-outage] FAIL: %s\n' "$*" >&2; exit 1; }

for command_name in supabase psql curl node bun git; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

EVIDENCE_SHA="${V3_S11_DEPENDENCY_SHA:-}"
[[ "$EVIDENCE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] \
  || fail "V3_S11_DEPENDENCY_SHA must be an exact 40-character commit SHA"
EVIDENCE_SHA="$(printf '%s' "$EVIDENCE_SHA" | tr '[:upper:]' '[:lower:]')"
CHECKOUT_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
[[ "$CHECKOUT_SHA" == "$EVIDENCE_SHA" ]] \
  || fail "V3_S11_DEPENDENCY_SHA $EVIDENCE_SHA does not match checked-out commit $CHECKOUT_SHA"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] \
  || fail "Exact-SHA dependency-outage evidence requires a clean worktree"
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
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing hosted/non-local database rehearsal ($DB_URL)" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt \
    -c "set \"request.jwt.claim.role\"='service_role'; $1"
}
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q \
    -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null
}

# S4 claims are consumer-wide. Do not let this rehearsal lease unrelated local work.
PREEXISTING_ACTIONABLE="$(db_value "
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

TMP_DIR="$(mktemp -d)"
READY_FILE="$TMP_DIR/dependency-ready.json"
PROBE_BUNDLE="$TMP_DIR/dependency-probe.mjs"
DEPENDENCY_PID=''
DEPENDENCY_PORT='0'
DEPENDENCY_URL=''

cleanup() {
  if [[ -n "$DEPENDENCY_PID" ]] && kill -0 "$DEPENDENCY_PID" >/dev/null 2>&1; then
    kill "$DEPENDENCY_PID" >/dev/null 2>&1 || true
    wait "$DEPENDENCY_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log "Bundle the production SystemError classifier probe for Node runtime parity"
bun build scripts/v3-s11-probe-dependency.ts \
  --target=node \
  --format=esm \
  --outfile="$PROBE_BUNDLE" >/dev/null
[[ -s "$PROBE_BUNDLE" ]] || fail "dependency probe bundle was not created"

probe_dependency() {
  node "$PROBE_BUNDLE" "$DEPENDENCY_URL" | tr -d '\r\n'
}

start_dependency() {
  rm -f "$READY_FILE"
  V3_S11_DEPENDENCY_READY_FILE="$READY_FILE" \
  V3_S11_DEPENDENCY_PORT="$DEPENDENCY_PORT" \
    node scripts/v3-s11-loopback-dependency.mjs &
  DEPENDENCY_PID=$!

  for ((attempt = 0; attempt < 50; attempt += 1)); do
    [[ -s "$READY_FILE" ]] && break
    kill -0 "$DEPENDENCY_PID" >/dev/null 2>&1 \
      || fail "loopback dependency exited before becoming ready"
    sleep 0.1
  done
  [[ -s "$READY_FILE" ]] || fail "loopback dependency did not become ready"

  local observed_port observed_url
  observed_port="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(value.port));' "$READY_FILE")"
  observed_url="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(value.url));' "$READY_FILE")"
  [[ "$observed_port" =~ ^[0-9]+$ ]] || fail "loopback dependency reported an invalid port"

  if [[ "$DEPENDENCY_PORT" == '0' ]]; then
    DEPENDENCY_PORT="$observed_port"
  elif [[ "$DEPENDENCY_PORT" != "$observed_port" ]]; then
    fail "restored dependency did not bind the original port"
  fi

  DEPENDENCY_URL="$observed_url"
  case "$DEPENDENCY_URL" in
    http://127.0.0.1:"$DEPENDENCY_PORT"/health) ;;
    *) fail "loopback dependency reported a non-isolated URL ($DEPENDENCY_URL)" ;;
  esac

  [[ "$(probe_dependency)" == 'OK' ]] || fail "loopback dependency health probe failed"
}

stop_dependency() {
  [[ -n "$DEPENDENCY_PID" ]] || fail "loopback dependency is not running"
  kill "$DEPENDENCY_PID"
  wait "$DEPENDENCY_PID"
  DEPENDENCY_PID=''
}

read -r EDITION_ID SHOW_ID OPERATION_ID < <(
  node --input-type=module -e 'import { randomUUID } from "node:crypto"; console.log(randomUUID(), randomUUID(), randomUUID());'
)
EDITION_NUMBER="$(db_value "select coalesce(max(edition_number),0) + 100001 from public.editions;")"
EDITION_SLUG="s11-dependency-${EDITION_ID%%-*}"
IDEMPOTENCY_KEY="v3-s11-dependency-$OPERATION_ID"
WORKER_OUTAGE="s11-dependency-outage-${OPERATION_ID%%-*}"
WORKER_RECOVER="s11-dependency-recovery-${OPERATION_ID%%-*}"

log "Create an isolated edition/show fixture"
db_exec "
insert into public.editions (id, name, edition_number, status, slug, published)
values (
  '$EDITION_ID'::uuid,
  'S11 dependency outage rehearsal',
  $EDITION_NUMBER,
  'draft',
  '$EDITION_SLUG',
  false
);
insert into public.shows (id, edition_id, name, kind, sort_order, published)
values (
  '$SHOW_ID'::uuid,
  '$EDITION_ID'::uuid,
  'S11 dependency outage show',
  'semi-final',
  1,
  false
);
"

log "Start the real isolated loopback dependency"
start_dependency
ORIGINAL_DEPENDENCY_PORT="$DEPENDENCY_PORT"

log "Generate a real jury.closed operation and its canonical jury.tasks consequence"
REQUEST_BODY="$(
  EDITION_ID="$EDITION_ID" SHOW_ID="$SHOW_ID" OPERATION_ID="$OPERATION_ID" IDEMPOTENCY_KEY="$IDEMPOTENCY_KEY" \
  node --input-type=module <<'NODE'
const body = {
  p_show_id: process.env.SHOW_ID,
  p_status: "closed",
  p_operation_id: process.env.OPERATION_ID,
  p_idempotency_key: process.env.IDEMPOTENCY_KEY,
  p_expected_version: 0,
};
process.stdout.write(JSON.stringify(body));
NODE
)"
RESPONSE_FILE="$TMP_DIR/jury-operation.json"
HTTP_STATUS="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "$API_URL/rest/v1/rpc/studio2_apply_jury_voting_status" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$REQUEST_BODY")"
[[ "$HTTP_STATUS" == '200' ]] \
  || fail "jury fixture operation returned HTTP $HTTP_STATUS: $(cat "$RESPONSE_FILE")"

EVENT_ID="$(db_value "
  select event_row.id::text
  from private.v3_domain_events event_row
  join private.v3_domain_event_outbox delivery
    on delivery.event_id=event_row.id
  where event_row.operation_id='$OPERATION_ID'::uuid
    and event_row.event_type='jury.closed'
    and delivery.consumer_key='jury.tasks'
  limit 1;
")"
[[ -n "$EVENT_ID" ]] || fail "real jury.closed operation did not emit a jury.tasks delivery"

[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('jury.tasks','$WORKER_OUTAGE',1,60);")" == "$EVENT_ID" ]] \
  || fail "canonical jury.tasks delivery could not be claimed"

log "Make the real dependency unavailable and classify the observed request failure"
stop_dependency
DEPENDENCY_ERROR_CODE="$(probe_dependency)"
[[ "$DEPENDENCY_ERROR_CODE" == 'DEPENDENCY_FAILURE' ]] \
  || fail "real dependency outage classified as $DEPENDENCY_ERROR_CODE instead of DEPENDENCY_FAILURE"

log "Persist the observed outage through the canonical S4 failure boundary"
service_exec "select public.studio2_fail_domain_event_delivery(
  '$EVENT_ID'::uuid,
  'jury.tasks',
  '$WORKER_OUTAGE',
  '$DEPENDENCY_ERROR_CODE',
  '{\"dependency\":\"s11.loopback\",\"observation\":\"real_connection_failure\"}'::jsonb,
  0,
  2
);"
[[ "$(db_value "select status || ':' || attempt_count || ':' || coalesce(last_error_code,'') from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == 'pending:1:DEPENDENCY_FAILURE' ]] \
  || fail "jury.tasks delivery did not retain the real dependency failure and retry state"
[[ "$(db_value "select last_error_metadata->>'observation' from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == 'real_connection_failure' ]] \
  || fail "jury.tasks delivery did not retain dependency outage evidence"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$EVENT_ID'::uuid;")" == '1' ]] \
  || fail "canonical DomainEvent was lost during dependency failure"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '0' ]] \
  || fail "failed dependency delivery created a consumer receipt"

log "Restore the same dependency endpoint and run the real Jury consequence processor"
DEPENDENCY_PORT="$ORIGINAL_DEPENDENCY_PORT"
start_dependency
[[ "$DEPENDENCY_PORT" == "$ORIGINAL_DEPENDENCY_PORT" ]] \
  || fail "dependency recovery changed the endpoint"
[[ "$(probe_dependency)" == 'OK' ]] || fail "restored dependency is still unavailable"

[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('jury.tasks','$WORKER_RECOVER',1,60);")" == "$EVENT_ID" ]] \
  || fail "recovered jury.tasks delivery could not be reclaimed"
[[ "$(db_value "select attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '2' ]] \
  || fail "recovery claim did not advance preserved attempt history"

RECOVERY_REPLAYED="$(service_value "
  select public.studio2_process_jury_domain_event(
    '$EVENT_ID'::uuid,
    'jury.tasks',
    '$WORKER_RECOVER'
  )->>'replayed';
")"
[[ "$RECOVERY_REPLAYED" == 'false' ]] || fail "first Jury recovery processing was reported as replay"
[[ "$(db_value "select status || ':' || attempt_count || ':' || coalesce(last_error_code,'') from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == 'completed:2:DEPENDENCY_FAILURE' ]] \
  || fail "successful Jury recovery did not preserve canonical attempt/error history"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '1' ]] \
  || fail "Jury dependency recovery did not create exactly one immutable consumer receipt"
[[ "$(db_value "select result_metadata->>'effect' from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == 'jury-task-reconciliation' ]] \
  || fail "recovery did not execute the real Jury task reconciliation consumer"

RECEIPT_BEFORE_REPLAY="$(db_value "select result_metadata::text from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")"

log "Replay the real consumer completion and prove exactly-once convergence"
REPLAY_RESULT="$(service_value "
  select public.studio2_process_jury_domain_event(
    '$EVENT_ID'::uuid,
    'jury.tasks',
    '$WORKER_RECOVER'
  )->>'replayed';
")"
[[ "$REPLAY_RESULT" == 'true' ]] || fail "duplicate Jury consumer processing did not report replay"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")" == '1' ]] \
  || fail "duplicate Jury recovery processing created another consumer receipt"
RECEIPT_AFTER_REPLAY="$(db_value "select result_metadata::text from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='jury.tasks';")"
[[ "$RECEIPT_AFTER_REPLAY" == "$RECEIPT_BEFORE_REPLAY" ]] \
  || fail "duplicate Jury recovery processing rewrote the immutable receipt"

REPORT_FILE="$TMP_DIR/report.json"
export EVIDENCE_SHA EVENT_ID EDITION_ID SHOW_ID DEPENDENCY_ERROR_CODE ORIGINAL_DEPENDENCY_PORT
node --input-type=module >"$REPORT_FILE" <<'NODE'
const report = {
  schemaVersion: 1,
  scenario: "unavailable_dependency",
  evidenceIdentity: {
    commitSha: process.env.EVIDENCE_SHA,
    environment: "local-supabase",
  },
  canonicalConsumer: {
    eventType: "jury.closed",
    consumerKey: "jury.tasks",
    effect: "jury-task-reconciliation",
    eventId: process.env.EVENT_ID,
    editionId: process.env.EDITION_ID,
    showId: process.env.SHOW_ID,
  },
  dependency: {
    kind: "isolated-loopback-http",
    host: "127.0.0.1",
    restoredSamePort: true,
    observedFailureCode: process.env.DEPENDENCY_ERROR_CODE,
  },
  recovery: {
    attemptCount: 2,
    retainedLastErrorCode: "DEPENDENCY_FAILURE",
    immutableConsumerReceipts: 1,
    completionReplayVerified: true,
  },
  productionTrafficRequired: false,
  certificationClaim: false,
  note: "Local deterministic failure-injection evidence only; this does not certify provider or full-service recovery.",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
NODE

cat "$REPORT_FILE"
if [[ -n "$OUTPUT_PATH" ]]; then
  mkdir -p "$(dirname "$OUTPUT_PATH")"
  cp "$REPORT_FILE" "$OUTPUT_PATH"
fi

log "PASS: real loopback outage produced DEPENDENCY_FAILURE and the canonical jury.tasks consumer recovered exactly once"
log "Fixture ledger rows remain in this disposable local database; reset local Supabase after retaining evidence"
