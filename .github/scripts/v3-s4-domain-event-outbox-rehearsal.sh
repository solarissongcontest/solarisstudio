#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s4-domain-event-outbox] %s\n' "$*"; }
fail() { printf '\n[v3-s4-domain-event-outbox] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\" = 'service_role'; $1"
}
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\" = 'service_role'; $1" >/dev/null
}
expect_db_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

OPERATION_ID='00000000-0000-4000-8000-00000000f401'
CORRELATION_ID='00000000-0000-4000-8000-00000000f402'

log "Seeding one processing operation receipt"
db_exec "
insert into public.studio2_operation_receipts (
  operation_id, actor_id, idempotency_key, correlation_id,
  request_fingerprint, command, risk_class, scope, status
) values (
  '$OPERATION_ID'::uuid, null, 's4-domain-event-fixture', '$CORRELATION_ID'::uuid,
  repeat('a', 64), 'v3.s4.domain_event_fixture', 'R2', '{}'::jsonb, 'processing'
)
on conflict (operation_id) do nothing;
"

log "Emitting one immutable fact and two per-consumer deliveries"
EVENT_ID="$(db_value "select private.v3_emit_domain_event(
  'entry.verified',
  'entry',
  'fixture-entry',
  1,
  '$OPERATION_ID'::uuid,
  null,
  null,
  '{\"source\":\"s4-rehearsal\"}'::jsonb,
  1,
  array['projection.entry','notifications.entry']::text[]
);")"
[[ -n "$EVENT_ID" ]] || fail "domain event id was not returned"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$EVENT_ID'::uuid;")" == '1' ]] || fail "canonical event missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid;")" == '2' ]] || fail "per-consumer outbox rows missing"
[[ "$(db_value "select correlation_id from private.v3_domain_events where id='$EVENT_ID'::uuid;")" == "$CORRELATION_ID" ]] || fail "event did not inherit operation correlation id"

log "Semantic replay reuses the same event and does not duplicate deliveries"
REPLAY_ID="$(db_value "select private.v3_emit_domain_event(
  'entry.verified','entry','fixture-entry',1,'$OPERATION_ID'::uuid,null,null,
  '{\"source\":\"s4-rehearsal\"}'::jsonb,1,
  array['notifications.entry','projection.entry','projection.entry']::text[]
);")"
[[ "$REPLAY_ID" == "$EVENT_ID" ]] || fail "semantic replay created a different event"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid;")" == '2' ]] || fail "semantic replay duplicated delivery state"
expect_db_failure "changed semantic replay" "select private.v3_emit_domain_event('entry.verified','entry','fixture-entry',1,'$OPERATION_ID'::uuid,null,null,'{\"source\":\"changed\"}'::jsonb,1,array['projection.entry']::text[]);"

log "Canonical facts cannot be rewritten or deleted"
expect_db_failure "domain event rewrite" "update private.v3_domain_events set payload='{}'::jsonb where id='$EVENT_ID'::uuid;"
expect_db_failure "domain event deletion" "delete from private.v3_domain_events where id='$EVENT_ID'::uuid;"

log "Claim leases serialize consumers independently"
CLAIMED_ALPHA="$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('projection.entry','worker-alpha',1,60);")"
[[ "$CLAIMED_ALPHA" == "$EVENT_ID" ]] || fail "projection consumer did not claim expected event"
[[ "$(db_value "select attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='projection.entry';")" == '1' ]] || fail "claim did not advance attempt count"
[[ "$(service_value "select count(*) from public.studio2_claim_domain_event_deliveries('projection.entry','worker-rival',1,60);")" == '0' ]] || fail "active lease allowed a second worker claim"

log "Completion writes one immutable consumer receipt and is replay-safe"
service_exec "select public.studio2_complete_domain_event_delivery('$EVENT_ID'::uuid,'projection.entry','worker-alpha','{\"projectionVersion\":1}'::jsonb);"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='projection.entry';")" == 'completed' ]] || fail "completed delivery did not reach terminal state"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='projection.entry';")" == '1' ]] || fail "consumer idempotency receipt missing"
[[ "$(service_value "select (public.studio2_complete_domain_event_delivery('$EVENT_ID'::uuid,'projection.entry','worker-alpha','{}'::jsonb)->>'replayed');")" == 'true' ]] || fail "duplicate completion was not reported as replay"
expect_db_failure "consumer receipt rewrite" "update private.v3_domain_event_consumer_receipts set result_metadata='{}'::jsonb where event_id='$EVENT_ID'::uuid and consumer_key='projection.entry';"

log "Retry transitions to dead-letter at the configured attempt ceiling"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('notifications.entry','worker-beta',1,60);")" == "$EVENT_ID" ]] || fail "notification consumer first claim failed"
service_exec "select public.studio2_fail_domain_event_delivery('$EVENT_ID'::uuid,'notifications.entry','worker-beta','DEPENDENCY_FAILURE','{}'::jsonb,0,2);"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='notifications.entry';")" == 'pending' ]] || fail "first failure did not schedule retry"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('notifications.entry','worker-beta',1,60);")" == "$EVENT_ID" ]] || fail "notification consumer retry claim failed"
service_exec "select public.studio2_fail_domain_event_delivery('$EVENT_ID'::uuid,'notifications.entry','worker-beta','DEPENDENCY_FAILURE','{}'::jsonb,0,2);"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='notifications.entry';")" == 'dead_letter' ]] || fail "attempt ceiling did not dead-letter delivery"
[[ "$(db_value "select dead_lettered_at is not null from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='notifications.entry';")" == 't' ]] || fail "dead-letter evidence timestamp missing"

log "Dead letters are explicitly recoverable"
service_exec "select public.studio2_requeue_dead_letter_domain_event('$EVENT_ID'::uuid,'notifications.entry',true);"
[[ "$(db_value "select status || ':' || attempt_count from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='notifications.entry';")" == 'pending:0' ]] || fail "dead-letter replay did not reset delivery"
[[ "$(service_value "select event_id from public.studio2_claim_domain_event_deliveries('notifications.entry','worker-gamma',1,60);")" == "$EVENT_ID" ]] || fail "requeued delivery could not be claimed"
service_exec "select public.studio2_complete_domain_event_delivery('$EVENT_ID'::uuid,'notifications.entry','worker-gamma','{}'::jsonb);"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and status='completed';")" == '2' ]] || fail "both independent consumers did not complete"

log "Browser roles cannot operate the internal event bus"
expect_db_failure "authenticated outbox claim" "set role authenticated; set \"request.jwt.claim.role\"='authenticated'; select * from public.studio2_claim_domain_event_deliveries('projection.entry','browser',1,60);"
expect_db_failure "authenticated direct event read" "set role authenticated; select count(*) from private.v3_domain_events;"
expect_db_failure "authenticated private event emission" "set role authenticated; select private.v3_emit_domain_event('entry.verified','entry','blocked',1,'$OPERATION_ID'::uuid);"

log "System V3 S4 DomainEvent/outbox rehearsal passed"
