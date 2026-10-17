#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-notice] %s\n' "$*" >&2; }
fail() { printf '\n[v3-s5-notice] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S5Notice2026!'
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

EDITION_ID='00000000-0000-4000-8000-00000000e981'
COUNTRY_ID='00000000-0000-4000-8000-00000000c981'
NOTICE_ONE='00000000-0000-4000-8000-00000000a981'
NOTICE_TWO='00000000-0000-4000-8000-00000000a982'

ELIGIBLE_USER="$(create_user 'v3-s5-notice-eligible@solaris.invalid')"
INELIGIBLE_USER="$(create_user 'v3-s5-notice-ineligible@solaris.invalid')"
[[ -n "$ELIGIBLE_USER" && -n "$INELIGIBLE_USER" ]] || fail "Auth fixtures missing user ids"

log "Seeding one eligible delegation recipient and one non-recipient"
db_exec "
insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Notice Consequences','s5-notice-consequences',9981,'active',false);
insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','S5 Notice Country','S5N');
insert into public.country_accounts(user_id,country_id,status,display_name)
values ('$ELIGIBLE_USER'::uuid,'$COUNTRY_ID'::uuid,'active','Eligible Notice Recipient');
insert into public.notification_preferences(profile_id,external_enabled,categories)
values
  ('$ELIGIBLE_USER'::uuid,true,array['official']::text[]),
  ('$INELIGIBLE_USER'::uuid,true,array['official']::text[])
on conflict (profile_id) do update
set external_enabled=excluded.external_enabled,categories=excluded.categories;
"

log "Publishing materializes authoritative recipient receipts and emits a privacy-safe event"
db_exec "
insert into public.studio2_official_notices(
  id,edition_id,notice_type,title,body,severity,audience,country_ids,
  acknowledgement_required,status,sent_at,created_by,updated_by,display_surfaces
) values (
  '$NOTICE_ONE','$EDITION_ID','official_notice','Secret rehearsal title',
  'Secret rehearsal body that must never enter the DomainEvent payload.',
  'action_required','all_delegations','{}'::uuid[],true,'published',now(),
  '$ELIGIBLE_USER'::uuid,'$ELIGIBLE_USER'::uuid,array['delegation_inbox']::text[]
);
"

[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ONE'::uuid and recipient_user_id='$ELIGIBLE_USER'::uuid and delivered_at is not null;")" == '1' ]] || fail "Eligible recipient receipt was not materialized"
[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ONE'::uuid and recipient_user_id='$INELIGIBLE_USER'::uuid;")" == '0' ]] || fail "Ineligible user received a notice receipt"

PUBLISHED_EVENT="$(db_value "select id::text from private.v3_domain_events where event_type='notice.published' and aggregate_id='$NOTICE_ONE' order by occurred_at desc limit 1;")"
[[ -n "$PUBLISHED_EVENT" ]] || fail "notice.published DomainEvent missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$PUBLISHED_EVENT'::uuid and payload ? 'title';")" == '0' ]] || fail "Notice title leaked into DomainEvent payload"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$PUBLISHED_EVENT'::uuid and payload ? 'body';")" == '0' ]] || fail "Notice body leaked into DomainEvent payload"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts r join private.v3_domain_events e on e.operation_id=r.operation_id where e.id='$PUBLISHED_EVENT'::uuid and r.command='notice.publish' and r.status='succeeded' and r.risk_class='R2';")" == '1' ]] || fail "Published notice operation receipt missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$PUBLISHED_EVENT'::uuid and consumer_key='notice.notifications';")" == '1' ]] || fail "Notice notification consequence missing"

log "The existing official provider now sees the materialized receipt"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('notice.notifications','notice-worker',20,60);")"
[[ "$CLAIMED" == *"$PUBLISHED_EVENT"* ]] || fail "notice.notifications delivery was not claimable"
service_exec "select public.studio2_process_notice_domain_event('$PUBLISHED_EVENT'::uuid,'notice.notifications','notice-worker');"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$ELIGIBLE_USER'::uuid and category='official' and subject_id='$NOTICE_ONE' and status='pending';")" == '1' ]] || fail "Official notification delivery candidate missing"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$INELIGIBLE_USER'::uuid and category='official' and subject_id='$NOTICE_ONE';")" == '0' ]] || fail "Ineligible user received official notification candidate"

REPLAYED="$(service_value "select public.studio2_process_notice_domain_event('$PUBLISHED_EVENT'::uuid,'notice.notifications','replay-worker')->>'replayed';")"
[[ "$REPLAYED" == 'true' ]] || fail "Notice consequence replay was not idempotent"

log "Supersession emits its own fact and correlates it to the replacement publication"
db_exec "
insert into public.studio2_official_notices(
  id,edition_id,notice_type,title,body,severity,audience,country_ids,
  acknowledgement_required,status,sent_at,created_by,updated_by,display_surfaces,supersedes_id
) values (
  '$NOTICE_TWO','$EDITION_ID','official_notice','Replacement title','Replacement body',
  'info','all_delegations','{}'::uuid[],false,'published',now(),
  '$ELIGIBLE_USER'::uuid,'$ELIGIBLE_USER'::uuid,array['delegation_inbox']::text[],'$NOTICE_ONE'::uuid
);
update public.studio2_official_notices
set status='superseded',superseded_by_id='$NOTICE_TWO'::uuid,updated_at=now()
where id='$NOTICE_ONE'::uuid;
"

REPLACEMENT_EVENT="$(db_value "select id::text from private.v3_domain_events where event_type='notice.published' and aggregate_id='$NOTICE_TWO' order by occurred_at desc limit 1;")"
SUPERSEDED_EVENT="$(db_value "select id::text from private.v3_domain_events where event_type='notice.superseded' and aggregate_id='$NOTICE_ONE' order by occurred_at desc limit 1;")"
[[ -n "$REPLACEMENT_EVENT" && -n "$SUPERSEDED_EVENT" ]] || fail "Supersession event chain missing"
[[ "$(db_value "select (select correlation_id::text from private.v3_domain_events where id='$REPLACEMENT_EVENT'::uuid) = (select correlation_id::text from private.v3_domain_events where id='$SUPERSEDED_EVENT'::uuid);")" == 't' ]] || fail "Superseded notice did not inherit replacement correlation"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SUPERSEDED_EVENT'::uuid;")" == '0' ]] || fail "notice.superseded unexpectedly scheduled delivery-failure work"

log "Unrelated notice edits do not fabricate lifecycle events"
BEFORE_COUNT="$(db_value "select count(*) from private.v3_domain_events where aggregate_type='notice' and aggregate_id='$NOTICE_TWO';")"
db_exec "update public.studio2_official_notices set title=title where id='$NOTICE_TWO'::uuid;"
AFTER_COUNT="$(db_value "select count(*) from private.v3_domain_events where aggregate_type='notice' and aggregate_id='$NOTICE_TWO';")"
[[ "$BEFORE_COUNT" == "$AFTER_COUNT" ]] || fail "Unrelated notice edit emitted a lifecycle event"

log "Browser role cannot execute the service-only consequence processor"
HTTP_CODE="$(curl -sS -o /tmp/v3-s5-notice-body -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/studio2_process_notice_domain_event" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' --data "{\"p_event_id\":\"$PUBLISHED_EVENT\",\"p_consumer_key\":\"notice.notifications\",\"p_worker_id\":\"browser-worker\"}")"
(( HTTP_CODE >= 400 )) || fail "anonymous Notice consequence processing unexpectedly succeeded: $(cat /tmp/v3-s5-notice-body)"
rm -f /tmp/v3-s5-notice-body

log "System V3 S5 Notice consequence rehearsal passed"
