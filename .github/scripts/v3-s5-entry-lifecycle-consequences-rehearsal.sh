#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-entry-lifecycle] %s\n' "$*"; }
fail() { printf '\n[v3-s5-entry-lifecycle] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

PASSWORD='V3S5EntryLifecycle2026!'
HTTP_STATUS=''
HTTP_BODY=''

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }
actor_exec() {
  local actor_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " >/dev/null
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url"
    -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json')
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$output")"
  rm -f "$output"
}

create_user() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "create $email returned HTTP $HTTP_STATUS: $HTTP_BODY"
  python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["id"])' <<< "$HTTP_BODY"
}

EDITION_ID='00000000-0000-4000-8000-00000000e931'
ROUND_ID='00000000-0000-4000-8000-00000000a931'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f931'
ENTRY_ID='00000000-0000-4000-8000-00000000d931'
FIXTURE_SUBMISSION_ID='00000000-0000-4000-8000-00000000f932'
FIXTURE_ENTRY_ID='00000000-0000-4000-8000-00000000d932'
NONPARTICIPATING_SUBMISSION_ID='00000000-0000-4000-8000-00000000f933'
SUBMIT_OPERATION_ID='00000000-0000-4000-8000-00000000b931'
NONPARTICIPATING_OPERATION_ID='00000000-0000-4000-8000-00000000b932'

ACTOR_ID="$(create_user 'v3-s5-entry-lifecycle@solaris.invalid')"
[[ -n "$ACTOR_ID" ]] || fail "Entry lifecycle actor was not created"

log "Seeding canonical Entry scope without fabricating lifecycle facts"
db_exec "
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Entry Lifecycle',2026,'s5-entry-lifecycle',9931,'active',false);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','S5 Entry lifecycle round','open',now()-interval '1 hour',now()+interval '1 hour',true);
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,participating,selection_method,editing_allowed,browser_session_id
) values (
  '$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','entry_lifecycle','Lifecycle Country',true,'internal',true,'entry-lifecycle-session'
),(
  '$FIXTURE_SUBMISSION_ID','$EDITION_ID','$ROUND_ID','entry_fixture','Fixture Country',true,'internal',true,'entry-fixture-session'
),(
  '$NONPARTICIPATING_SUBMISSION_ID','$EDITION_ID','$ROUND_ID','entry_nonparticipant','Nonparticipant Country',false,null,true,'entry-nonparticipant-session'
);
"

log "Authenticated canonical Entry insert emits immutable version evidence"
actor_exec "$ACTOR_ID" "
insert into public.internal_entries(id,submission_id,artist,song_title,song_url)
values ('$ENTRY_ID','$SUBMISSION_ID','Lifecycle Artist','Lifecycle Song','https://example.invalid/lifecycle');
"

VERSION_ONE="$(db_value "select current_version_id::text from public.internal_entries where id='$ENTRY_ID'::uuid;")"
[[ -n "$VERSION_ONE" ]] || fail "authenticated Entry insert did not create immutable version evidence"
VERSION_EVENT_ONE="$(db_value "select id::text from private.v3_domain_events where event_type='entry.version_changed' and aggregate_id='$ENTRY_ID' and aggregate_version=1 order by occurred_at desc limit 1;")"
[[ -n "$VERSION_EVENT_ONE" ]] || fail "entry.version_changed was not emitted for authenticated canonical write"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts r join private.v3_domain_events e on e.operation_id=r.operation_id where e.id='$VERSION_EVENT_ONE'::uuid and r.command='entry.submit' and r.risk_class='R1' and r.status='succeeded';")" == '1' ]] || fail "Entry version operation receipt is missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$VERSION_EVENT_ONE'::uuid and consumer_key='entry.tasks';")" == '1' ]] || fail "entry.version_changed task delivery is missing"

log "Ownerless database fixtures remain usable but do not fabricate canonical events"
db_exec "insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values ('$FIXTURE_ENTRY_ID','$FIXTURE_SUBMISSION_ID','Fixture Artist','Fixture Song','https://example.invalid/fixture');"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='entry.version_changed' and aggregate_id='$FIXTURE_ENTRY_ID';")" == '0' ]] || fail "ownerless fixture fabricated entry.version_changed"

log "A successful participating Confirmation operation emits entry.submitted"
db_exec "
insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status
)
select
  '$SUBMIT_OPERATION_ID'::uuid,
  '$ACTOR_ID'::uuid,
  'entry-lifecycle-submit',
  '$SUBMIT_OPERATION_ID'::uuid,
  private.studio2_request_fingerprint(
    'confirmation.submit','R1',
    jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
    jsonb_build_object('fixture',true)
  ),
  'confirmation.submit','R1',
  jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
  'processing';
update public.studio2_operation_receipts
set status='succeeded',
    result=jsonb_build_object(
      'ok',true,
      'submissionId','$SUBMISSION_ID'::uuid,
      'roundId','$ROUND_ID'::uuid,
      'editionId','$EDITION_ID'::uuid,
      'editCount',0
    ),
    completed_at=now(),updated_at=now()
where operation_id='$SUBMIT_OPERATION_ID'::uuid;
"

SUBMITTED_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='entry.submitted';")"
[[ -n "$SUBMITTED_EVENT" ]] || fail "entry.submitted was not emitted for a participating canonical Entry"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id || ':' || aggregate_version::text from private.v3_domain_events where id='$SUBMITTED_EVENT'::uuid;")" == "entry_submission:$SUBMISSION_ID:0" ]] || fail "entry.submitted aggregate provenance is wrong"
[[ "$(db_value "select payload->>'entryCount' from private.v3_domain_events where id='$SUBMITTED_EVENT'::uuid;")" == '1' ]] || fail "entry.submitted did not bind the canonical Entry count"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SUBMITTED_EVENT'::uuid and consumer_key='entry.tasks';")" == '1' ]] || fail "entry.submitted task delivery is missing"

db_exec "update public.studio2_operation_receipts set updated_at=updated_at where operation_id='$SUBMIT_OPERATION_ID'::uuid;"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='entry.submitted';")" == '1' ]] || fail "succeeded receipt replay duplicated entry.submitted"

log "Non-participation does not fabricate Entry submission truth"
db_exec "
insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status
)
select
  '$NONPARTICIPATING_OPERATION_ID'::uuid,
  '$ACTOR_ID'::uuid,
  'entry-lifecycle-nonparticipant',
  '$NONPARTICIPATING_OPERATION_ID'::uuid,
  private.studio2_request_fingerprint(
    'confirmation.submit','R1',
    jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
    jsonb_build_object('fixture','nonparticipant')
  ),
  'confirmation.submit','R1',
  jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
  'processing';
update public.studio2_operation_receipts
set status='succeeded',
    result=jsonb_build_object(
      'ok',true,
      'submissionId','$NONPARTICIPATING_SUBMISSION_ID'::uuid,
      'roundId','$ROUND_ID'::uuid,
      'editionId','$EDITION_ID'::uuid,
      'editCount',0
    ),
    completed_at=now(),updated_at=now()
where operation_id='$NONPARTICIPATING_OPERATION_ID'::uuid;
"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$NONPARTICIPATING_OPERATION_ID'::uuid and event_type='entry.submitted';")" == '0' ]] || fail "non-participating Confirmation fabricated entry.submitted"

log "A second authenticated content revision advances the Entry aggregate"
actor_exec "$ACTOR_ID" "update public.internal_entries set artist='Lifecycle Artist Revised' where id='$ENTRY_ID'::uuid;"
VERSION_TWO="$(db_value "select current_version_id::text from public.internal_entries where id='$ENTRY_ID'::uuid;")"
[[ "$VERSION_TWO" != "$VERSION_ONE" ]] || fail "Entry revision reused immutable version identity"
VERSION_EVENT_TWO="$(db_value "select id::text from private.v3_domain_events where event_type='entry.version_changed' and aggregate_id='$ENTRY_ID' and aggregate_version=2 order by occurred_at desc limit 1;")"
[[ -n "$VERSION_EVENT_TWO" ]] || fail "second entry.version_changed fact is missing"
[[ "$(db_value "select payload->>'parentVersionId' from private.v3_domain_events where id='$VERSION_EVENT_TWO'::uuid;")" == "$VERSION_ONE" ]] || fail "Entry version lineage was not preserved in the event"

log "Entry lifecycle facts converge through the existing task consumer"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('entry.tasks','entry-lifecycle-worker',100,60);")"
for expected in "$VERSION_EVENT_ONE" "$SUBMITTED_EVENT" "$VERSION_EVENT_TWO"; do
  printf '%s\n' "$CLAIMED" | grep -Fxq "$expected" || fail "entry.tasks could not claim $expected"
done
while IFS= read -r event_id; do
  [[ -n "$event_id" ]] || continue
  service_exec "select public.studio2_process_entry_domain_event('$event_id'::uuid,'entry.tasks','entry-lifecycle-worker');"
done <<< "$CLAIMED"
for expected in "$VERSION_EVENT_ONE" "$SUBMITTED_EVENT" "$VERSION_EVENT_TWO"; do
  [[ "$(db_value "select result_metadata->>'effect' from private.v3_domain_event_consumer_receipts where event_id='$expected'::uuid and consumer_key='entry.tasks';")" == 'entry-task-reconciliation' ]] || fail "entry-task-reconciliation receipt is missing for $expected"
done

log "System V3 S5 Entry lifecycle consequence rehearsal passed"
