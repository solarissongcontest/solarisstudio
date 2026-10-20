#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-notification] %s\n' "$*" >&2; }
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

rpc() {
  local function_name="$1" bearer="$2" data="$3"
  request POST "$API_URL/rest/v1/rpc/$function_name" "$bearer" "$ANON_KEY" "$data"
}

create_user() {
  local email="$1"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
    "$(jq -nc --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password,email_confirm:true}')"
  [[ "$HTTP_STATUS" == "200" ]] || fail "Could not create $email ($HTTP_STATUS): $HTTP_BODY"
  jq -r '.id' <<<"$HTTP_BODY"
}

sign_in() {
  local email="$1"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
    "$(jq -nc --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password}')"
  [[ "$HTTP_STATUS" == "200" ]] || fail "Could not sign in $email ($HTTP_STATUS): $HTTP_BODY"
  jq -r '.access_token' <<<"$HTTP_BODY"
}

log "Seeding notification lifecycle fixture"
USER_ID="$(create_user 'v3-s5-notification@solaris.invalid')"
TOKEN="$(sign_in 'v3-s5-notification@solaris.invalid')"

NOTIFICATION_ID="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
insert into public.notifications (
  user_id,
  title,
  body,
  type,
  route,
  delivery_class,
  importance,
  action_required,
  dedupe_key,
  data
)
values (
  '$USER_ID'::uuid,
  'S5 notification fixture',
  'Deterministic notification consequence rehearsal',
  'system',
  '/notifications',
  'silent',
  'normal',
  false,
  'v3-s5-notification-rehearsal',
  '{"source":"v3-s5-notification-rehearsal"}'::jsonb
)
returning id;
SQL
)"
[[ -n "$NOTIFICATION_ID" ]] || fail "Notification fixture did not return an id"

log "Queueing delivery through the canonical notification lifecycle RPC"
rpc v3_notification_delivery_transition "$TOKEN" \
  "$(jq -nc --arg notificationId "$NOTIFICATION_ID" '{p_notification_id:$notificationId,p_transition:"queue"}')"
[[ "$HTTP_STATUS" == "200" ]] || fail "Queue transition failed ($HTTP_STATUS): $HTTP_BODY"

queued_events="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_domain_events where event_type='notification.queued' and aggregate_id='$NOTIFICATION_ID'::uuid;")"
[[ "$queued_events" == "1" ]] || fail "Expected exactly one notification.queued DomainEvent, got $queued_events"

queued_outbox="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_domain_event_outbox o join public.studio2_domain_events e on e.id=o.domain_event_id where e.event_type='notification.queued' and e.aggregate_id='$NOTIFICATION_ID'::uuid;")"
[[ "$queued_outbox" == "1" ]] || fail "Expected queued outbox evidence, got $queued_outbox"

log "Delivering the queued notification"
rpc v3_notification_delivery_transition "$TOKEN" \
  "$(jq -nc --arg notificationId "$NOTIFICATION_ID" '{p_notification_id:$notificationId,p_transition:"deliver"}')"
[[ "$HTTP_STATUS" == "200" ]] || fail "Deliver transition failed ($HTTP_STATUS): $HTTP_BODY"

delivered_events="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_domain_events where event_type='notification.delivered' and aggregate_id='$NOTIFICATION_ID'::uuid;")"
[[ "$delivered_events" == "1" ]] || fail "Expected exactly one notification.delivered DomainEvent, got $delivered_events"

log "Creating a second notification and exercising the failed-delivery consequence"
FAILED_NOTIFICATION_ID="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
insert into public.notifications (
  user_id,
  title,
  body,
  type,
  route,
  delivery_class,
  importance,
  action_required,
  dedupe_key,
  data
)
values (
  '$USER_ID'::uuid,
  'S5 failed notification fixture',
  'Deterministic failed delivery consequence rehearsal',
  'system',
  '/notifications',
  'silent',
  'normal',
  false,
  'v3-s5-notification-failed-rehearsal',
  '{"source":"v3-s5-notification-rehearsal"}'::jsonb
)
returning id;
SQL
)"
[[ -n "$FAILED_NOTIFICATION_ID" ]] || fail "Failed notification fixture did not return an id"

rpc v3_notification_delivery_transition "$TOKEN" \
  "$(jq -nc --arg notificationId "$FAILED_NOTIFICATION_ID" '{p_notification_id:$notificationId,p_transition:"queue"}')"
[[ "$HTTP_STATUS" == "200" ]] || fail "Failed-notification queue transition failed ($HTTP_STATUS): $HTTP_BODY"

rpc v3_notification_delivery_transition "$TOKEN" \
  "$(jq -nc --arg notificationId "$FAILED_NOTIFICATION_ID" '{p_notification_id:$notificationId,p_transition:"fail",p_error:"provider timeout"}')"
[[ "$HTTP_STATUS" == "200" ]] || fail "Fail transition failed ($HTTP_STATUS): $HTTP_BODY"

failed_events="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_domain_events where event_type='notification.failed' and aggregate_id='$FAILED_NOTIFICATION_ID'::uuid;")"
[[ "$failed_events" == "1" ]] || fail "Expected exactly one notification.failed DomainEvent, got $failed_events"

failed_task="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_tasks where task_type='notification.delivery_failed' and subject_id='$FAILED_NOTIFICATION_ID'::uuid and status='open';")"
[[ "$failed_task" == "1" ]] || fail "Expected one open notification.delivery_failed task, got $failed_task"

failed_event_id="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select id from public.studio2_domain_events where event_type='notification.failed' and aggregate_id='$FAILED_NOTIFICATION_ID'::uuid order by occurred_at desc limit 1;")"
[[ -n "$failed_event_id" ]] || fail "Could not locate failed event id"

log "Claiming and replaying the failed-notification outbox consequence"
CLAIMED="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_claim_domain_event_outbox(10,'v3-s5-notification-rehearsal',30) where event_id='$failed_event_id'::uuid;")"
[[ "$CLAIMED" == "1" ]] || fail "Expected to claim failed notification event, got $CLAIMED"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "select public.studio2_process_notification_domain_event('$failed_event_id'::uuid);" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "select public.studio2_process_notification_domain_event('$failed_event_id'::uuid);" >/dev/null

failed_task_after_replay="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select count(*) from public.studio2_tasks where task_type='notification.delivery_failed' and subject_id='$FAILED_NOTIFICATION_ID'::uuid and status='open';")"
[[ "$failed_task_after_replay" == "1" ]] || fail "Replay duplicated or lost the failed-delivery task"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "select public.studio2_complete_domain_event_outbox('$failed_event_id'::uuid,'v3-s5-notification-rehearsal');" >/dev/null

processed_state="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "select state from public.studio2_domain_event_outbox where domain_event_id='$failed_event_id'::uuid;")"
[[ "$processed_state" == "completed" ]] || fail "Expected failed notification outbox completion, got $processed_state"

log "PASS: notification queue/deliver/fail lifecycle emits canonical events and failed delivery consequences are replay-safe"
