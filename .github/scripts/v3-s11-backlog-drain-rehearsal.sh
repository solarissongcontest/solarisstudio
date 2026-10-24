#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-backlog] %s\n' "$*"; }
fail() { printf '\n[v3-s11-backlog] FAIL: %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required"
command -v psql >/dev/null 2>&1 || fail "psql is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
command -v git >/dev/null 2>&1 || fail "git is required"

positive_integer() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" =~ ^[0-9]+$ && "$value" -ge 1 ]] \
    || fail "$name must be an explicit positive integer"
  printf '%s' "$value"
}

required_text() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "${value//[[:space:]]/}" ]] || fail "$name is required"
  printf '%s' "$value"
}

BACKLOG_EVENTS="$(positive_integer V3_S11_BACKLOG_EVENTS)"
DRAIN_BATCH="$(positive_integer V3_S11_DRAIN_BATCH)"
READ_REQUESTS="$(positive_integer V3_S11_READ_REQUESTS)"
(( DRAIN_BATCH <= 100 )) || fail "V3_S11_DRAIN_BATCH must be <= 100 because the canonical S4 claim contract is bounded to 100"

EVIDENCE_SHA="$(required_text V3_S11_BACKLOG_SHA | tr '[:upper:]' '[:lower:]')"
[[ "$EVIDENCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "V3_S11_BACKLOG_SHA must be an exact 40-character commit SHA"
CHECKOUT_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
[[ "$CHECKOUT_SHA" == "$EVIDENCE_SHA" ]] \
  || fail "V3_S11_BACKLOG_SHA $EVIDENCE_SHA does not match checked-out commit $CHECKOUT_SHA"
LOAD_SOURCE="$(required_text V3_S11_BACKLOG_LOAD_SOURCE)"
LOAD_RATIONALE="$(required_text V3_S11_BACKLOG_LOAD_RATIONALE)"
OUTPUT_PATH="${V3_S11_BACKLOG_OUTPUT:-}"

case "$LOAD_SOURCE" in
  production-telemetry|contest-participation-or-audience|provider-constraint|historical-peak|approved-forecast|explicit-rehearsal-plan|exploratory) ;;
  *) fail "V3_S11_BACKLOG_LOAD_SOURCE is not an allowed evidence source" ;;
esac

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

# The claim API is consumer-wide, not edition-scoped. A deterministic local
# rehearsal must therefore start with no actionable jury.tasks work so this
# run cannot lease/process unrelated deliveries.
PREEXISTING_ACTIONABLE="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  where delivery.consumer_key='jury.tasks'
    and not exists (
      select 1 from private.v3_domain_event_consumer_receipts receipt
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

read -r EDITION_ID SHOW_ID < <(
  python3 - <<'PY'
import uuid
print(uuid.uuid4(), uuid.uuid4())
PY
)
EDITION_NUMBER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select coalesce(max(edition_number),0) + 100001 from public.editions;")"
EDITION_SLUG="s11-backlog-${EDITION_ID%%-*}"
WORKER_ID="v3-s11-backlog-${EDITION_ID%%-*}"
TMP_DIR="$(mktemp -d)"
READ_SAMPLES="$TMP_DIR/read-samples.txt"
DRAIN_SAMPLES="$TMP_DIR/drain-samples.txt"
OPERATIONS_FILE="$TMP_DIR/operations.txt"
READ_PID=''

cleanup_local_processes() {
  if [[ -n "$READ_PID" ]]; then
    kill "$READ_PID" >/dev/null 2>&1 || true
    wait "$READ_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup_local_processes EXIT

log "Creating isolated edition/show fixture"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions (id, name, edition_number, status, slug, published)
values (
  '$EDITION_ID'::uuid,
  'S11 backlog drain rehearsal',
  $EDITION_NUMBER,
  'draft',
  '$EDITION_SLUG',
  false
);
insert into public.shows (id, edition_id, name, kind, sort_order, published)
values (
  '$SHOW_ID'::uuid,
  '$EDITION_ID'::uuid,
  'S11 backlog show',
  'semi-final',
  1,
  false
);
SQL

log "Generating $BACKLOG_EVENTS real jury.closed operations without consuming their jury.tasks consequences"
for ((i=0; i<BACKLOG_EVENTS; i++)); do
  OPERATION_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
  IDEMPOTENCY_KEY="v3-s11-backlog-$OPERATION_ID"
  REQUEST_BODY="$(python3 - <<PY
import json
print(json.dumps({
  "p_show_id": "$SHOW_ID",
  "p_status": "closed",
  "p_operation_id": "$OPERATION_ID",
  "p_idempotency_key": "$IDEMPOTENCY_KEY",
  "p_expected_version": $i,
}, separators=(",", ":")))
PY
)"
  BODY_FILE="$TMP_DIR/create-$i.json"
  STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
    -X POST "$API_URL/rest/v1/rpc/studio2_apply_jury_voting_status" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$REQUEST_BODY")"
  [[ "$STATUS" == '200' ]] || fail "fixture operation $i returned HTTP $STATUS: $(cat "$BODY_FILE")"
  printf '%s\n' "$OPERATION_ID" >> "$OPERATIONS_FILE"
done

PENDING_BEFORE="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event_row on event_row.id=delivery.event_id
  where delivery.consumer_key='jury.tasks'
    and delivery.status='pending'
    and event_row.edition_id='$EDITION_ID'::uuid
    and event_row.event_type='jury.closed';
")"
[[ "$PENDING_BEFORE" == "$BACKLOG_EVENTS" ]] \
  || fail "expected $BACKLOG_EVENTS pending fixture jury.tasks deliveries, found $PENDING_BEFORE"

VERSION_AFTER_GENERATE="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select version from public.studio2_jury_window_versions where edition_id='$EDITION_ID'::uuid;")"
[[ "$VERSION_AFTER_GENERATE" == "$BACKLOG_EVENTS" ]] \
  || fail "fixture generated $BACKLOG_EVENTS operations but Jury version is $VERSION_AFTER_GENERATE"

sample_reads() {
  : > "$READ_SAMPLES"
  for ((read_index=0; read_index<READ_REQUESTS; read_index++)); do
    curl -sS \
      -o /dev/null \
      -w '%{http_code} %{time_total}\n' \
      "$API_URL/rest/v1/shows?id=eq.$SHOW_ID&select=id,edition_id,name" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      >> "$READ_SAMPLES" || printf '000 0\n' >> "$READ_SAMPLES"
  done
}

log "Starting ordinary read sampling while canonical consumers drain the backlog"
sample_reads &
READ_PID=$!

START_NS="$(python3 - <<'PY'
import time
print(time.time_ns())
PY
)"
PROCESSED=0
BATCHES=0
MAX_BATCH_CLAIMED=0
: > "$DRAIN_SAMPLES"

while (( PROCESSED < BACKLOG_EVENTS )); do
  CLAIMED_FILE="$TMP_DIR/claimed-$BATCHES.txt"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -F '|' -c "
    set \"request.jwt.claim.role\"='service_role';
    select event_id::text, edition_id::text
    from public.studio2_claim_domain_event_deliveries(
      'jury.tasks', '$WORKER_ID', $DRAIN_BATCH, 60
    );
  " > "$CLAIMED_FILE"

  CLAIMED_COUNT="$(grep -cve '^$' "$CLAIMED_FILE" || true)"
  (( CLAIMED_COUNT > 0 )) || fail "canonical claim returned no work while $((BACKLOG_EVENTS - PROCESSED)) fixture deliveries remained"
  (( CLAIMED_COUNT <= DRAIN_BATCH )) || fail "claim exceeded requested bounded batch size"
  (( CLAIMED_COUNT > MAX_BATCH_CLAIMED )) && MAX_BATCH_CLAIMED=$CLAIMED_COUNT

  while IFS='|' read -r EVENT_ID CLAIMED_EDITION_ID; do
    [[ -n "$EVENT_ID" ]] || continue
    [[ "$CLAIMED_EDITION_ID" == "$EDITION_ID" ]] \
      || fail "canonical jury.tasks claim leased unrelated edition $CLAIMED_EDITION_ID; local isolation invariant violated"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
      set \"request.jwt.claim.role\"='service_role';
      select public.studio2_process_jury_domain_event(
        '$EVENT_ID'::uuid,
        'jury.tasks',
        '$WORKER_ID'
      );
    " >/dev/null
    PROCESSED=$((PROCESSED + 1))
  done < "$CLAIMED_FILE"

  BATCHES=$((BATCHES + 1))
  REMAINING="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    select count(*)
    from private.v3_domain_event_outbox delivery
    join private.v3_domain_events event_row on event_row.id=delivery.event_id
    where delivery.consumer_key='jury.tasks'
      and delivery.status in ('pending','processing')
      and event_row.edition_id='$EDITION_ID'::uuid
      and event_row.event_type='jury.closed';
  ")"
  printf '%s|%s|%s\n' "$BATCHES" "$PROCESSED" "$REMAINING" >> "$DRAIN_SAMPLES"
done

END_NS="$(python3 - <<'PY'
import time
print(time.time_ns())
PY
)"

wait "$READ_PID" || fail "ordinary read sampler failed"
READ_PID=''

PENDING_AFTER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event_row on event_row.id=delivery.event_id
  where delivery.consumer_key='jury.tasks'
    and delivery.status in ('pending','processing')
    and event_row.edition_id='$EDITION_ID'::uuid
    and event_row.event_type='jury.closed';
")"
[[ "$PENDING_AFTER" == '0' ]] || fail "fixture backlog did not drain to zero; $PENDING_AFTER deliveries remain actionable"

COMPLETED_RECEIPTS="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_consumer_receipts receipt
  join private.v3_domain_events event_row on event_row.id=receipt.event_id
  where receipt.consumer_key='jury.tasks'
    and event_row.edition_id='$EDITION_ID'::uuid
    and event_row.event_type='jury.closed';
")"
[[ "$COMPLETED_RECEIPTS" == "$BACKLOG_EVENTS" ]] \
  || fail "expected $BACKLOG_EVENTS immutable consumer receipts, found $COMPLETED_RECEIPTS"

DEAD_LETTER_AFTER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event_row on event_row.id=delivery.event_id
  where delivery.consumer_key='jury.tasks'
    and delivery.status='dead_letter'
    and event_row.edition_id='$EDITION_ID'::uuid;
")"
[[ "$DEAD_LETTER_AFTER" == '0' ]] || fail "backlog drain produced $DEAD_LETTER_AFTER dead-letter fixture deliveries"

RETRYING_AFTER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event_row on event_row.id=delivery.event_id
  where delivery.consumer_key='jury.tasks'
    and delivery.attempt_count > 1
    and event_row.edition_id='$EDITION_ID'::uuid;
")"
[[ "$RETRYING_AFTER" == '0' ]] || fail "backlog drain unexpectedly retried $RETRYING_AFTER fixture deliveries"

READ_FAILURES="$(awk '$1 != "200" {count++} END {print count+0}' "$READ_SAMPLES")"
[[ "$READ_FAILURES" == '0' ]] || fail "ordinary read sampling observed $READ_FAILURES failed reads during drain"

REPORT_FILE="$TMP_DIR/report.json"
export EVIDENCE_SHA LOAD_SOURCE LOAD_RATIONALE BACKLOG_EVENTS DRAIN_BATCH READ_REQUESTS PENDING_BEFORE PENDING_AFTER COMPLETED_RECEIPTS DEAD_LETTER_AFTER RETRYING_AFTER BATCHES MAX_BATCH_CLAIMED START_NS END_NS READ_SAMPLES DRAIN_SAMPLES API_URL
python3 - <<'PY' > "$REPORT_FILE"
import json, math, os, statistics

def pct(values, fraction):
    if not values:
        return None
    ordered=sorted(values)
    index=max(0, math.ceil(len(ordered)*fraction)-1)
    return ordered[min(index,len(ordered)-1)]

read_latencies=[]
read_statuses={}
with open(os.environ['READ_SAMPLES'], encoding='utf-8') as fh:
    for line in fh:
        if not line.strip():
            continue
        status, seconds=line.split()
        read_statuses[status]=read_statuses.get(status,0)+1
        read_latencies.append(float(seconds)*1000)

drain_samples=[]
with open(os.environ['DRAIN_SAMPLES'], encoding='utf-8') as fh:
    for line in fh:
        if not line.strip():
            continue
        batch,processed,remaining=line.strip().split('|')
        drain_samples.append({
            'batch':int(batch),
            'processed':int(processed),
            'remaining':int(remaining),
        })

start_ns=int(os.environ['START_NS'])
end_ns=int(os.environ['END_NS'])
duration_ms=(end_ns-start_ns)/1_000_000
backlog_events=int(os.environ['BACKLOG_EVENTS'])
report={
  'schemaVersion':1,
  'evidenceIdentity':{
    'commitSha':os.environ['EVIDENCE_SHA'],
    'environment':'local-supabase',
    'loadShapeSource':os.environ['LOAD_SOURCE'],
    'loadShapeRationale':os.environ['LOAD_RATIONALE'],
  },
  'scenario':'reconciliation-backlog-drain',
  'requestedLoad':{
    'events':backlog_events,
    'drainBatch':int(os.environ['DRAIN_BATCH']),
    'ordinaryReadRequests':int(os.environ['READ_REQUESTS']),
  },
  'backlog':{
    'before':int(os.environ['PENDING_BEFORE']),
    'after':int(os.environ['PENDING_AFTER']),
    'completedReceipts':int(os.environ['COMPLETED_RECEIPTS']),
    'deadLetterAfter':int(os.environ['DEAD_LETTER_AFTER']),
    'retryingAfter':int(os.environ['RETRYING_AFTER']),
    'batches':int(os.environ['BATCHES']),
    'maxBatchClaimed':int(os.environ['MAX_BATCH_CLAIMED']),
    'samples':drain_samples,
  },
  'drain':{
    'durationMs':duration_ms,
    'eventsPerSecond':(backlog_events/(duration_ms/1000)) if duration_ms > 0 else None,
  },
  'ordinaryReads':{
    'statusCounts':read_statuses,
    'failures':sum(count for status,count in read_statuses.items() if status != '200'),
    'latencyMs':{
      'p50':pct(read_latencies,0.50),
      'p95':pct(read_latencies,0.95),
      'p99':pct(read_latencies,0.99),
      'max':max(read_latencies) if read_latencies else None,
    },
  },
  'thresholds':None,
  'certificationClaim':False,
  'productionTrafficRequired':False,
  'note':'Local bounded measurement only; no production-capacity or SLO threshold is inferred from this rehearsal.',
}
print(json.dumps(report, indent=2))
PY

cat "$REPORT_FILE"
if [[ -n "$OUTPUT_PATH" ]]; then
  mkdir -p "$(dirname "$OUTPUT_PATH")"
  cp "$REPORT_FILE" "$OUTPUT_PATH"
fi

log "PASS: bounded canonical jury.tasks backlog drained to zero with all ordinary reads successful"
log "Fixture ledger rows are intentionally left in this disposable local database because S4 ledgers are immutable; reset local Supabase after retaining evidence."
