#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-notification] %s\n' "$*"; }
fail() { printf '\n[v3-s5-notification] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S5Notification2026!'
HTTP_STATUS=''
HTTP_BODY=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json')
  if [[ -n "$data" ]]; then args+=(--data "$data"); fi
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  fi
  log "PASS: $label"
}

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

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

create_user() {
  local email="$1"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
  expect_success "create $email"
  printf '%s' "$HTTP_BODY" | json_value id
}

process_claimed_notification_events() {
  local worker="$1"
  local claimed
  claimed="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('notification.tasks','$worker',100,60);")"
  while IFS= read -r event_id; do
    [[ -n "$event_id" ]] || continue
    service_exec "select public.studio2_process_notification_domain_event('$event_id'::uuid,'notification.tasks','$worker');"
  done <<< "$claimed"
}

DELIVERY_ID='00000000-0000-4000-8000-00000000d991'
RECIPIENT_USER="$(create_user 'v3-s5-notification-recipient@solaris.invalid')"
OPERATOR_USER="$(create_user 'v3-s5-notification-operator@solaris.invalid')"
[[ -n "$RECIPIENT_USER" && -n "$OPERATOR_USER" ]] || fail "Auth fixture ids missing"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$OPERATOR_USER'::uuid,'system.manage',null);"

log "Initial pending delivery emits notification.queued without opening a failure task"
db_exec "
insert into public.notification_deliveries(
  id,user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
  '$DELIVERY_ID','$RECIPIENT_USER'::uuid,'official','official.notice','fixture-subject',
  'v3-s5-notification-fixture','/notifications','Private notification title',
  'Private notification body',now(),'pending'
);
"
QUEUED_EVENT="$(db_value "select id::text from private.v3_domain_events where aggregate_type='notification_delivery' and aggregate_id='$DELIVERY_ID' and event_type='notification.queued' and aggregate_version=0;")"
[[ -n "$QUEUED_EVENT" ]] || fail "notification.queued event missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$QUEUED_EVENT'::uuid and (payload ? 'title' or payload ? 'body' or payload ? 'userId' or payload ? 'error');")" == '0' ]] || fail "Sensitive notification data leaked into DomainEvent payload"
process_claimed_notification_events 'queued-worker'
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='notification-delivery:$DELIVERY_ID' and state<>'resolved';")" == '0' ]] || fail "queued notification incorrectly opened a failure task"

log "A durable failed attempt emits notification.failed and opens exactly one global recovery task"
db_exec "
update public.notification_deliveries
set status='processing',processing_started_at=now(),last_attempt_at=now(),attempt_count=1,error=null
where id='$DELIVERY_ID';
update public.notification_deliveries
set status='failed',processing_started_at=null,error='Synthetic provider failure'
where id='$DELIVERY_ID';
"
FAILED_EVENT="$(db_value "select id::text from private.v3_domain_events where aggregate_id='$DELIVERY_ID' and event_type='notification.failed' and aggregate_version=1;")"
[[ -n "$FAILED_EVENT" ]] || fail "notification.failed event missing"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts r join private.v3_domain_events e on e.operation_id=r.operation_id where e.id='$FAILED_EVENT'::uuid and r.command='notification.fail' and r.risk_class='R1' and r.status='succeeded';")" == '1' ]] || fail "notification.failed operation receipt missing"
process_claimed_notification_events 'failed-worker'
TASK_ID="$(db_value "select id::text from public.studio2_organizer_tasks where source_key='notification-delivery:$DELIVERY_ID' and task_type='notification.delivery_failed' and state='open';")"
[[ -n "$TASK_ID" ]] || fail "notification.failed task was not opened"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='notification-delivery:$DELIVERY_ID';")" == '1' ]] || fail "notification failure created duplicate tasks"

log "Failure-task notification failure does not recurse into a second-order failure task"
CHILD_DELIVERY="$(db_value "select id::text from public.notification_deliveries where category='organizer_tasks' and subject_id='$TASK_ID' order by created_at desc limit 1;")"
[[ -n "$CHILD_DELIVERY" ]] || fail "failure task did not create its Organizer delivery"
process_claimed_notification_events 'child-queued-worker'
db_exec "
update public.notification_deliveries
set status='processing',processing_started_at=now(),last_attempt_at=now(),attempt_count=1,error=null
where id='$CHILD_DELIVERY'::uuid;
update public.notification_deliveries
set status='failed',processing_started_at=null,error='Synthetic recursive provider failure'
where id='$CHILD_DELIVERY'::uuid;
"
CHILD_FAILED_EVENT="$(db_value "select id::text from private.v3_domain_events where aggregate_id='$CHILD_DELIVERY' and event_type='notification.failed' and aggregate_version=1;")"
[[ -n "$CHILD_FAILED_EVENT" ]] || fail "recursive notification.failed event missing"
process_claimed_notification_events 'child-failed-worker'
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='notification-delivery:$CHILD_DELIVERY';")" == '0' ]] || fail "recursive failure created a second-order failure task"

log "Retry queue transition resolves the failed-delivery task"
db_exec "update public.notification_deliveries set status='pending',scheduled_for=now(),processing_started_at=null,error=null where id='$DELIVERY_ID';"
RETRY_EVENT="$(db_value "select id::text from private.v3_domain_events where aggregate_id='$DELIVERY_ID' and event_type='notification.queued' and aggregate_version=1;")"
[[ -n "$RETRY_EVENT" ]] || fail "retry notification.queued event missing"
process_claimed_notification_events 'retry-worker'
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$TASK_ID'::uuid and state='resolved' and resolved_at is not null;")" == '1' ]] || fail "retry did not resolve the failure task"

log "Next successful attempt emits notification.delivered and keeps recovery state resolved"
db_exec "
update public.notification_deliveries
set status='processing',processing_started_at=now(),last_attempt_at=now(),attempt_count=2,error=null
where id='$DELIVERY_ID';
update public.notification_deliveries
set status='sent',sent_at=now(),processing_started_at=null,error=null
where id='$DELIVERY_ID';
"
DELIVERED_EVENT="$(db_value "select id::text from private.v3_domain_events where aggregate_id='$DELIVERY_ID' and event_type='notification.delivered' and aggregate_version=2;")"
[[ -n "$DELIVERED_EVENT" ]] || fail "notification.delivered event missing"
process_claimed_notification_events 'delivered-worker'
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "delivered notification reopened the failure task"

log "Consumer replay is idempotent"
REPLAYED="$(service_value "select public.studio2_process_notification_domain_event('$DELIVERED_EVENT'::uuid,'notification.tasks','replay-worker')->>'replayed';")"
[[ "$REPLAYED" == 'true' ]] || fail "Notification consequence replay was not idempotent"

log "Operational processing/deferral/suppression states do not fabricate lifecycle facts"
BEFORE_COUNT="$(db_value "select count(*) from private.v3_domain_events where aggregate_id='$DELIVERY_ID';")"
db_exec "update public.notification_deliveries set status='suppressed',error='rehearsal suppression' where id='$DELIVERY_ID';"
AFTER_COUNT="$(db_value "select count(*) from private.v3_domain_events where aggregate_id='$DELIVERY_ID';")"
[[ "$BEFORE_COUNT" == "$AFTER_COUNT" ]] || fail "suppression fabricated a canonical notification event"

log "Browser role cannot execute the service-only consequence processor"
HTTP_CODE="$(curl -sS -o /tmp/v3-s5-notification-body -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/studio2_process_notification_domain_event" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' --data "{\"p_event_id\":\"$DELIVERED_EVENT\",\"p_consumer_key\":\"notification.tasks\",\"p_worker_id\":\"browser-worker\"}")"
(( HTTP_CODE >= 400 )) || fail "anonymous Notification consequence processing unexpectedly succeeded: $(cat /tmp/v3-s5-notification-body)"
rm -f /tmp/v3-s5-notification-body

log "System V3 S5 Notification consequence rehearsal passed"
