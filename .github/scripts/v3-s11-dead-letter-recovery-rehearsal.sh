#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-dead-letter-recovery] %s\n' "$*"; }
fail() { printf '\n[v3-s11-dead-letter-recovery] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }
expect_service_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

OPERATION_ID='00000000-0000-4000-8000-00000000b110'
CONSUMER_KEY='recovery.s11'
WORKER_FAIL='s11-failing-worker'
WORKER_RECOVER='s11-recovery-worker'

log "Seed one operation and one single-consumer event"
db_exec "
insert into public.studio2_operation_receipts (
  operation_id, actor_id, idempotency_key, correlation_id,
  request_fingerprint, command, risk_class, scope, status
) values (
  '$OPERATION_ID'::uuid, null, 's11-dead-letter-fixture', '$OPERATION_ID'::uuid,
  repeat('b', 64), 'v3.s11.dead_letter_fixture', 'R2', '{}'::jsonb, 'processing'
)
on conflict (operation_id) do nothing;
"
EVENT_ID="$(db_value "select private.v3_emit_domain_event(
  'entry.reviewed', 'entry', 's11-fixture', 1, '$OPERATION_ID'::uuid,
  null, null, '{\"source\":\"s11-recovery\"}'::jsonb, 1,
  array['$CONSUMER_KEY']::text[]
);")"
[[ -n "$EVENT_ID" ]] || fail "event id missing"

log "Force the delivery to dead-letter while preserving canonical event truth"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('$CONSUMER_KEY','$WORKER_FAIL',1,60);")" == "$EVENT_ID" ]] || fail "initial claim failed"
service_exec "select public.studio2_fail_domain_event_delivery('$EVENT_ID'::uuid,'$CONSUMER_KEY','$WORKER_FAIL','INJECTED_DEPENDENCY_FAILURE','{}'::jsonb,0,1);"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'dead_letter' ]] || fail "delivery did not dead-letter"
[[ "$(db_value "select attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '1' ]] || fail "attempt history missing before recovery"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$EVENT_ID'::uuid;")" == '1' ]] || fail "canonical event was lost"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '0' ]] || fail "failed delivery created a consumer receipt"

log "Requeue one exact delivery without erasing attempt history"
service_exec "select public.studio2_requeue_dead_letter_domain_event('$EVENT_ID'::uuid,'$CONSUMER_KEY',false);"
[[ "$(db_value "select status || ':' || attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'pending:1' ]] || fail "requeue did not preserve attempt history"
expect_service_failure "second requeue while pending" "select public.studio2_requeue_dead_letter_domain_event('$EVENT_ID'::uuid,'$CONSUMER_KEY',false);"

log "Normal worker path recovers the exact delivery"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('$CONSUMER_KEY','$WORKER_RECOVER',1,60);")" == "$EVENT_ID" ]] || fail "requeued delivery could not be claimed"
[[ "$(db_value "select attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '2' ]] || fail "recovery claim did not advance preserved attempt count"
RECOVERY_RESULT="$(service_value "select public.studio2_complete_domain_event_delivery('$EVENT_ID'::uuid,'$CONSUMER_KEY','$WORKER_RECOVER','{\"recovered\":true}'::jsonb)->>'replayed';")"
[[ "$RECOVERY_RESULT" == 'false' ]] || fail "first recovery completion was reported as replay"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 'completed' ]] || fail "recovered delivery is not completed"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '1' ]] || fail "recovery did not create exactly one immutable consumer receipt"
[[ "$(db_value "select (result_metadata->>'recovered')::boolean from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 't' ]] || fail "recovery receipt metadata missing"

log "Lost-response replay converges on the same immutable receipt"
REPLAY_RESULT="$(service_value "select public.studio2_complete_domain_event_delivery('$EVENT_ID'::uuid,'$CONSUMER_KEY','$WORKER_RECOVER','{\"different\":\"ignored-on-replay\"}'::jsonb)->>'replayed';")"
[[ "$REPLAY_RESULT" == 'true' ]] || fail "duplicate completion did not report replay"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == '1' ]] || fail "duplicate completion created a second consumer receipt"
[[ "$(db_value "select (result_metadata->>'recovered')::boolean from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='$CONSUMER_KEY';")" == 't' ]] || fail "duplicate completion rewrote the original receipt"
expect_service_failure "requeue after successful recovery" "select public.studio2_requeue_dead_letter_domain_event('$EVENT_ID'::uuid,'$CONSUMER_KEY',false);"

log "System V3 S11 dead-letter recovery rehearsal passed"
