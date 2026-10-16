#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-publication] %s\n' "$*"; }
fail() { printf '\n[v3-s5-publication] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

HTTP_STATUS=''
HTTP_BODY=''
request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
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
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}
json_value() {
  local path="$1"
  python3 -c '
import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
else: print(value)
' "$path"
}
rpc() {
  local token="$1" name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$name" "$token" "$ANON_KEY" "$body"
}

EDITION_ID='00000000-0000-4000-8000-00000000e971'
SHOW_ID='00000000-0000-4000-8000-00000000a971'
IMMEDIATE_OP='00000000-0000-4000-8000-00000000b971'
SCHEDULE_OP='00000000-0000-4000-8000-00000000b972'
SUCCESS_EXEC='00000000-0000-4000-8000-00000000b973'
FAIL_SCHEDULE_OP='00000000-0000-4000-8000-00000000b974'
BLOCKED_EXEC='00000000-0000-4000-8000-00000000b975'
PASSWORD='V3S5Publication2026!'
PUBLIC_CONFIG='{"participants":true}'

log "Creating publication operator and canonical show"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"v3-s5-publication@solaris.invalid\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create publication operator"
USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
[[ -n "$USER_ID" ]] || fail "Publication operator has no user id"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"v3-s5-publication@solaris.invalid\",\"password\":\"$PASSWORD\"}"
expect_success "sign in publication operator"
USER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
[[ -n "$USER_TOKEN" ]] || fail "Publication operator has no access token"

db_exec "
insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Publication Consequences','s5-publication-consequences',9971,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values ('$SHOW_ID','$EDITION_ID','S5 Publication Final','final',1,false,'{}'::jsonb);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID'::uuid,'publishing.publish','$EDITION_ID'::uuid);
"
[[ "$(db_value "select state || ':' || version::text from public.studio2_show_publication_controls where show_id='$SHOW_ID';")" == 'draft:1' ]] || fail "Publication control did not bootstrap at draft:1"

log "Immediate publication uses the canonical operation and emits publication.changed"
rpc "$USER_TOKEN" studio2_apply_show_publication_change \
  "{\"p_show_id\":\"$SHOW_ID\",\"p_target_state\":\"public\",\"p_config\":$PUBLIC_CONFIG,\"p_scheduled_for\":null,\"p_operation_id\":\"$IMMEDIATE_OP\",\"p_idempotency_key\":\"v3-s5-publication-immediate\",\"p_expected_version\":1}"
expect_success "canonical immediate publication"
[[ "$(printf '%s' "$HTTP_BODY" | json_value state)" == 'public' ]] || fail "Immediate operation did not return public state: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value version)" == '2' ]] || fail "Immediate operation did not return version 2: $HTTP_BODY"
[[ "$(db_value "select published::text from public.shows where id='$SHOW_ID';")" == 'true' ]] || fail "Immediate publication did not update public show projection"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$IMMEDIATE_OP'::uuid and event_type='publication.changed' and aggregate_id='$SHOW_ID' and aggregate_version=2;")" == '1' ]] || fail "Immediate publication.changed event missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='$IMMEDIATE_OP'::uuid and o.consumer_key='publication.tasks';")" == '1' ]] || fail "Immediate publication task consequence missing"

log "Scheduled success gets a distinct execution operation inside the scheduling correlation chain"
SCHEDULE_AT="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat().replace("+00:00","Z"))')"
rpc "$USER_TOKEN" studio2_apply_show_publication_change \
  "{\"p_show_id\":\"$SHOW_ID\",\"p_target_state\":\"scheduled\",\"p_config\":$PUBLIC_CONFIG,\"p_scheduled_for\":\"$SCHEDULE_AT\",\"p_operation_id\":\"$SCHEDULE_OP\",\"p_idempotency_key\":\"v3-s5-publication-schedule-success\",\"p_expected_version\":2}"
expect_success "canonical successful-publication schedule"
[[ "$(printf '%s' "$HTTP_BODY" | json_value state)" == 'scheduled' ]] || fail "Schedule operation did not return scheduled state: $HTTP_BODY"
[[ "$(printf '%s' "$HTTP_BODY" | json_value version)" == '3' ]] || fail "Schedule operation did not return version 3: $HTTP_BODY"
[[ "$(db_value "select (scheduled_by='$USER_ID'::uuid and scheduled_operation_id='$SCHEDULE_OP'::uuid)::text from public.studio2_show_publication_controls where show_id='$SHOW_ID';")" == 'true' ]] || fail "Scheduled control lacks canonical actor/operation ownership"

# Exercise the exact scheduler commit semantics without waiting for wall-clock due
# time. The real scheduler's due-time selection is already mature; this S5 test is
# about the committed execution fact and the event/consequence bridge.
db_exec "do \$worker\$
declare
  v_control public.studio2_show_publication_controls%rowtype;
  v_show public.shows%rowtype;
begin
  select * into v_control
  from public.studio2_show_publication_controls
  where show_id='$SHOW_ID'
  for update;

  if v_control.state <> 'scheduled' or v_control.version <> 3 then
    raise exception 'Unexpected scheduled fixture state';
  end if;

  update public.shows
  set publication_config=v_control.frozen_config,
      published=true,
      updated_at=now()
  where id=v_control.show_id
  returning * into v_show;

  update public.studio2_show_publication_controls
  set state='public',
      version=version+1,
      scheduled_for=null,
      scheduled_from_state=null,
      source_show_updated_at=v_show.updated_at,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id=v_control.show_id;

  insert into public.studio2_show_publication_executions(
    id,show_id,edition_id,scheduled_operation_id,status,intended_config,
    source_show_updated_at,source_result_version,checks,executed_at
  ) values (
    '$SUCCESS_EXEC',v_control.show_id,v_control.edition_id,v_control.scheduled_operation_id,
    'succeeded',v_control.frozen_config,v_control.source_show_updated_at,
    v_control.source_result_version,'{}'::jsonb,now()
  );
end
\$worker\$;"
[[ "$(db_value "select state || ':' || version::text from public.studio2_show_publication_controls where show_id='$SHOW_ID';")" == 'public:4' ]] || fail "Successful worker commit did not end at public:4"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$SUCCESS_EXEC'::uuid and command='publication.show.execute' and correlation_id='$SCHEDULE_OP'::uuid and status='succeeded';")" == '1' ]] || fail "Scheduled success did not get a distinct correlated execution operation"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$SUCCESS_EXEC'::uuid and event_type='publication.changed' and aggregate_version=4;")" == '1' ]] || fail "Scheduled success publication.changed event missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$SCHEDULE_OP'::uuid and payload->>'executionId'='$SUCCESS_EXEC';")" == '0' ]] || fail "Scheduled execution incorrectly reused the scheduling operation identity"

log "Blocked scheduled execution gets its own execution operation and publication.failed fact"
FAIL_SCHEDULE_AT="$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat().replace("+00:00","Z"))')"
rpc "$USER_TOKEN" studio2_apply_show_publication_change \
  "{\"p_show_id\":\"$SHOW_ID\",\"p_target_state\":\"scheduled\",\"p_config\":$PUBLIC_CONFIG,\"p_scheduled_for\":\"$FAIL_SCHEDULE_AT\",\"p_operation_id\":\"$FAIL_SCHEDULE_OP\",\"p_idempotency_key\":\"v3-s5-publication-schedule-blocked\",\"p_expected_version\":4}"
expect_success "canonical blocked-publication schedule"
[[ "$(printf '%s' "$HTTP_BODY" | json_value version)" == '5' ]] || fail "Blocked schedule operation did not return version 5: $HTTP_BODY"

db_exec "do \$worker\$
declare
  v_control public.studio2_show_publication_controls%rowtype;
begin
  select * into v_control
  from public.studio2_show_publication_controls
  where show_id='$SHOW_ID'
  for update;

  if v_control.state <> 'scheduled' or v_control.version <> 5 then
    raise exception 'Unexpected blocked schedule fixture state';
  end if;

  update public.studio2_show_publication_controls
  set state=coalesce(v_control.scheduled_from_state,'draft'),
      version=version+1,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure='blocked by rehearsal',
      last_failure_at=now(),
      updated_at=now()
  where show_id=v_control.show_id;

  insert into public.studio2_show_publication_executions(
    id,show_id,edition_id,scheduled_operation_id,status,intended_config,
    source_show_updated_at,source_result_version,checks,failure_reason,executed_at
  ) values (
    '$BLOCKED_EXEC',v_control.show_id,v_control.edition_id,v_control.scheduled_operation_id,
    'blocked',v_control.frozen_config,v_control.source_show_updated_at,
    v_control.source_result_version,'{}'::jsonb,'blocked by rehearsal',now()
  );
end
\$worker\$;"
[[ "$(db_value "select state || ':' || version::text from public.studio2_show_publication_controls where show_id='$SHOW_ID';")" == 'public:6' ]] || fail "Blocked worker did not return to the frozen public source state"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$BLOCKED_EXEC'::uuid and command='publication.show.execute' and correlation_id='$FAIL_SCHEDULE_OP'::uuid and result->>'status'='blocked';")" == '1' ]] || fail "Blocked execution operation receipt missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$BLOCKED_EXEC'::uuid and event_type='publication.failed' and payload->>'failureCode'='PUBLICATION_REVALIDATION_BLOCKED' and aggregate_version=6;")" == '1' ]] || fail "publication.failed event missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='$BLOCKED_EXEC'::uuid and o.consumer_key='publication.tasks';")" == '1' ]] || fail "Blocked publication task consequence missing"

log "Task consequences use the shared leased consumer and replay receipt contract"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('publication.tasks','publication-worker',100,60);")"
[[ -n "$CLAIMED" ]] || fail "No publication.tasks deliveries were claimable"
while IFS= read -r event_id; do
  [[ -n "$event_id" ]] || continue
  service_exec "select public.studio2_process_publication_domain_event('$event_id'::uuid,'publication.tasks','publication-worker');"
done <<< "$CLAIMED"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where consumer_key='publication.tasks' and status='completed';")" -ge '5' ]] || fail "Publication task deliveries did not complete"

FIRST_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$IMMEDIATE_OP'::uuid and event_type='publication.changed';")"
[[ "$(service_value "select public.studio2_process_publication_domain_event('$FIRST_EVENT'::uuid,'publication.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Publication consequence replay was not idempotent"

log "Browser role cannot execute service-only consequence processor"
HTTP_CODE="$(curl -sS -o /tmp/v3-s5-publication-body -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/studio2_process_publication_domain_event" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' --data "{\"p_event_id\":\"$FIRST_EVENT\",\"p_consumer_key\":\"publication.tasks\",\"p_worker_id\":\"browser-worker\"}")"
(( HTTP_CODE >= 400 )) || fail "anonymous Publication consequence processing unexpectedly succeeded: $(cat /tmp/v3-s5-publication-body)"
rm -f /tmp/v3-s5-publication-body

log "System V3 S5 Publication consequence rehearsal passed"
