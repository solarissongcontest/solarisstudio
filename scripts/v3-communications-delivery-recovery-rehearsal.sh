#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-communications-delivery] %s\n' "$*"; }
fail() { printf '\n[v3-communications-delivery] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
actor_value() {
  local actor_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " | tail -n 1
}
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    $1
    commit;
  " | tail -n 1
}
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    begin;
    select set_config('request.jwt.claim.role', 'service_role', true);
    $1
    commit;
  " >/dev/null
}

process_notification_events() {
  local worker="$1" claimed
  claimed="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('notification.tasks','$worker',100,60);")"
  while IFS= read -r event_id; do
    [[ -n "$event_id" ]] || continue
    service_exec "select public.studio2_process_notification_domain_event('$event_id'::uuid,'notification.tasks','$worker');"
  done <<< "$claimed"
}

EDITION_ID='00000000-0000-4000-8000-00000000e654'
COUNTRY_ONE='00000000-0000-4000-8000-00000000c651'
COUNTRY_TWO='00000000-0000-4000-8000-00000000c652'
COUNTRY_THREE='00000000-0000-4000-8000-00000000c653'
NOTICE_ID='00000000-0000-4000-8000-00000000a654'
OPERATOR_ID='00000000-0000-4000-8000-000000009654'
USER_ONE='00000000-0000-4000-8000-000000009651'
USER_TWO='00000000-0000-4000-8000-000000009652'
USER_THREE='00000000-0000-4000-8000-000000009653'
BATCH_ONE='00000000-0000-4000-8000-00000000b651'
BATCH_TWO='00000000-0000-4000-8000-00000000b652'

log "Seeding isolated draft, three eligible recipients and two active push subscriptions"
db_exec "
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('$OPERATOR_ID','authenticated','authenticated','v3-comms-operator@solaris.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
  ('$USER_ONE','authenticated','authenticated','v3-comms-one@solaris.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
  ('$USER_TWO','authenticated','authenticated','v3-comms-two@solaris.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
  ('$USER_THREE','authenticated','authenticated','v3-comms-three@solaris.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','Communications Delivery Recovery','communications-delivery-recovery',9654,'active',false);
insert into public.countries(id,name,short_code)
values
  ('$COUNTRY_ONE','Recovery One','RC1'),
  ('$COUNTRY_TWO','Recovery Two','RC2'),
  ('$COUNTRY_THREE','Recovery Three','RC3');
insert into public.country_accounts(user_id,country_id,status,display_name)
values
  ('$USER_ONE','$COUNTRY_ONE','active','Recovery One'),
  ('$USER_TWO','$COUNTRY_TWO','active','Recovery Two'),
  ('$USER_THREE','$COUNTRY_THREE','active','Recovery Three');

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$OPERATOR_ID','communications.send','$EDITION_ID'),
  ('$OPERATOR_ID','system.manage',null);

insert into public.notification_preferences(profile_id,external_enabled,categories)
values
  ('$USER_ONE',true,array['official']::text[]),
  ('$USER_TWO',true,array['official']::text[]),
  ('$USER_THREE',true,array['official']::text[])
on conflict (profile_id) do update
set external_enabled=excluded.external_enabled,categories=excluded.categories;

insert into public.app_push_subscriptions(
  id,user_id,endpoint,p256dh,auth_secret,user_agent,created_at,updated_at,last_seen_at
) values
  ('00000000-0000-4000-8000-00000000d651','$USER_ONE','https://push.invalid/one','p256dh-one','auth-one','rehearsal',now(),now(),now()),
  ('00000000-0000-4000-8000-00000000d652','$USER_TWO','https://push.invalid/two','p256dh-two','auth-two','rehearsal',now(),now(),now());

insert into public.studio2_official_notices(
  id,edition_id,notice_type,title,body,severity,audience,country_ids,
  acknowledgement_required,status,created_by,updated_by,display_surfaces
) values (
  '$NOTICE_ID','$EDITION_ID','official_notice','Recovery rehearsal','Private rehearsal body',
  'action_required','all_delegations','{}'::uuid[],true,'draft','$OPERATOR_ID','$OPERATOR_ID',
  array['delegation_inbox','mysolaris_home']::text[]
);
"

log "Pre-send preview reuses audience truth and creates no fake receipts/deliveries"
PREVIEW="$(actor_value "$OPERATOR_ID" "select public.studio2_notice_recipient_preview('$EDITION_ID','$NOTICE_ID')::text;")"
[[ "$PREVIEW" == *'"eligibleRecipients": 3'* ]] || fail "recipient preview did not resolve all three eligible recipients: $PREVIEW"
[[ "$PREVIEW" == *'"pushEligible": 2'* ]] || fail "recipient preview did not resolve two push-eligible users: $PREVIEW"
[[ "$PREVIEW" == *'"publishRevalidatesRecipients": true'* ]] || fail "preview does not declare publish revalidation"
[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ID';")" == '0' ]] \
  || fail "recipient preview materialized fake notice receipts"
[[ "$(db_value "select count(*) from public.notification_deliveries where category='official' and subject_id='$NOTICE_ID';")" == '0' ]] \
  || fail "recipient preview materialized fake notification deliveries"

log "Publishing re-evaluates recipients and canonical provider creates notice-scoped deliveries"
db_exec "update public.studio2_official_notices
set status='published',sent_at=now(),updated_by='$OPERATOR_ID',updated_at=now()
where id='$NOTICE_ID';"
[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ID';")" == '3' ]] \
  || fail "publish did not materialize exactly three canonical recipient receipts"
service_exec "select public.solaris_enqueue_app_notifications(now());"
[[ "$(db_value "select count(*) from public.notification_deliveries where category='official' and subject_id='$NOTICE_ID';")" == '3' ]] \
  || fail "official provider did not create exactly three notice-scoped deliveries"

DELIVERY_ONE="$(db_value "select id::text from public.notification_deliveries where subject_id='$NOTICE_ID' and user_id='$USER_ONE' order by created_at desc limit 1;")"
DELIVERY_TWO="$(db_value "select id::text from public.notification_deliveries where subject_id='$NOTICE_ID' and user_id='$USER_TWO' order by created_at desc limit 1;")"
DELIVERY_THREE="$(db_value "select id::text from public.notification_deliveries where subject_id='$NOTICE_ID' and user_id='$USER_THREE' order by created_at desc limit 1;")"
[[ -n "$DELIVERY_ONE" && -n "$DELIVERY_TWO" && -n "$DELIVERY_THREE" ]] || fail "delivery fixture ids missing"

log "Two failures open delivery Tasks while a sent row remains healthy"
db_exec "
update public.notification_deliveries
set status='processing',processing_started_at=now(),last_attempt_at=now(),attempt_count=1,error=null
where id in ('$DELIVERY_ONE'::uuid,'$DELIVERY_TWO'::uuid,'$DELIVERY_THREE'::uuid);
update public.notification_deliveries
set status='failed',processing_started_at=null,error=case
  when id='$DELIVERY_ONE'::uuid then '410 Gone https://push.invalid/one'
  else '429 Too many requests endpoint=https://push.invalid/two'
end
where id in ('$DELIVERY_ONE'::uuid,'$DELIVERY_TWO'::uuid);
update public.notification_deliveries
set status='sent',sent_at=now(),provider_accepted_at=now(),received_at=now(),displayed_at=now(),opened_at=now(),processing_started_at=null,error=null
where id='$DELIVERY_THREE'::uuid;
"
process_notification_events 'communications-failure-worker'
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key in ('notification-delivery:$DELIVERY_ONE','notification-delivery:$DELIVERY_TWO') and state='open';")" == '2' ]] \
  || fail "notification failures did not create two open recovery Tasks"

log "Notice summary is scoped, stage-aware and sanitizes raw provider details"
SUMMARY="$(actor_value "$OPERATOR_ID" "select public.studio2_notice_delivery_summary('$EDITION_ID','$NOTICE_ID')::text;")"
[[ "$SUMMARY" == *'"total": 3'* && "$SUMMARY" == *'"failed": 2'* && "$SUMMARY" == *'"sent": 1'* ]] \
  || fail "delivery summary counts are wrong: $SUMMARY"
[[ "$SUMMARY" == *'"providerAccepted": 1'* && "$SUMMARY" == *'"displayed": 1'* && "$SUMMARY" == *'"opened": 1'* ]] \
  || fail "delivery stage summary is wrong: $SUMMARY"
[[ "$SUMMARY" == *'"retryCapability": "system.manage"'* && "$SUMMARY" == *'"canRetryFailed": true'* ]] \
  || fail "delivery summary did not expose retry capability truth: $SUMMARY"
[[ "$SUMMARY" != *'push.invalid'* && "$SUMMARY" != *'USER_ONE'* && "$SUMMARY" != *'USER_TWO'* ]] \
  || fail "delivery summary leaked endpoint or recipient identity: $SUMMARY"
[[ "$SUMMARY" == *'Push subscription is no longer valid'* && "$SUMMARY" == *'Push provider rate limit'* ]] \
  || fail "delivery summary did not expose safe error categories: $SUMMARY"

log "Bounded batch retries only one failed row and reports partial outcome"
PARTIAL="$(actor_value "$OPERATOR_ID" "select public.studio2_retry_failed_notice_deliveries(
  '$EDITION_ID','$NOTICE_ID','$BATCH_ONE','communications-partial',1,'$BATCH_ONE'
)::text;")"
[[ "$PARTIAL" == *'"outcome": "partial"'* ]] || fail "bounded retry did not report partial outcome: $PARTIAL"
[[ "$PARTIAL" == *'"succeeded": 1'* && "$PARTIAL" == *'"remainingFailed": 1'* ]] \
  || fail "bounded retry counts are wrong: $PARTIAL"
[[ "$(db_value "select count(*) from public.notification_deliveries where id in ('$DELIVERY_ONE'::uuid,'$DELIVERY_TWO'::uuid) and status='pending';")" == '1' ]] \
  || fail "bounded retry did not move exactly one failed row to pending"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_THREE'::uuid;")" == 'sent' ]] \
  || fail "notice retry touched a nonfailed sent delivery"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key in ('notification-delivery:$DELIVERY_ONE','notification-delivery:$DELIVERY_TWO') and state='resolved';")" == '1' ]] \
  || fail "bounded retry did not immediately resolve exactly one delivery-failure Task"

log "Exact operation replay is reconciled and cannot retry the remaining failure"
REPLAY="$(actor_value "$OPERATOR_ID" "select public.studio2_retry_failed_notice_deliveries(
  '$EDITION_ID','$NOTICE_ID','$BATCH_ONE','communications-partial',1,'$BATCH_ONE'
)::text;")"
[[ "$REPLAY" == *'"replayed": true'* ]] || fail "notice retry operation did not reconcile exact replay: $REPLAY"
[[ "$(db_value "select count(*) from public.notification_deliveries where id in ('$DELIVERY_ONE'::uuid,'$DELIVERY_TWO'::uuid) and status='failed';")" == '1' ]] \
  || fail "replayed batch mutated the remaining failed delivery"

log "Second bounded operation recovers the remaining failed delivery"
FINAL="$(actor_value "$OPERATOR_ID" "select public.studio2_retry_failed_notice_deliveries(
  '$EDITION_ID','$NOTICE_ID','$BATCH_TWO','communications-final',50,'$BATCH_TWO'
)::text;")"
[[ "$FINAL" == *'"outcome": "success"'* && "$FINAL" == *'"remainingFailed": 0'* ]] \
  || fail "final retry did not recover remaining failure: $FINAL"
[[ "$(db_value "select count(*) from public.notification_deliveries where id in ('$DELIVERY_ONE'::uuid,'$DELIVERY_TWO'::uuid) and status='pending';")" == '2' ]] \
  || fail "both failed deliveries were not requeued"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key in ('notification-delivery:$DELIVERY_ONE','notification-delivery:$DELIVERY_TWO') and state='resolved';")" == '2' ]] \
  || fail "all delivery-failure Tasks were not resolved"
[[ "$(db_value "select status from public.notification_deliveries where id='$DELIVERY_THREE'::uuid;")" == 'sent' ]] \
  || fail "final batch touched the healthy sent delivery"

[[ "$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$OPERATOR_ID'::uuid and command='system.push.retry_failed' and status='succeeded';")" == '4' ]] \
  || fail "expected two parent + two child retry receipts"
[[ "$(db_value "select count(*) from public.admin_audit_log where action='notice_failed_deliveries_retried' and record_id='$NOTICE_ID';")" == '2' ]] \
  || fail "notice batch retry audit evidence is incomplete"

log "System V3 Official Communications delivery recovery rehearsal passed"
