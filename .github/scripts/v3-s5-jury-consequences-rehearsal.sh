#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-jury-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-jury-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Destructive fixtures. This rehearsal is deliberately local-only and must
# never acquire a hosted Supabase fallback.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role authenticated; set request.jwt.claims='{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; set request.jwt.claim.role='authenticated'; $sql"
}
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set request.jwt.claim.role='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set request.jwt.claim.role='service_role'; $1" >/dev/null; }
expect_denied() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set role authenticated; set request.jwt.claim.role='authenticated'; $sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

ORGANIZER_ID='00000000-0000-4000-8000-00000000a941'
COUNTRY_A='00000000-0000-4000-8000-00000000c941'
COUNTRY_B='00000000-0000-4000-8000-00000000c942'
COUNTRY_C='00000000-0000-4000-8000-00000000c943'
COUNTRY_D='00000000-0000-4000-8000-00000000c944'
EDITION_ID='00000000-0000-4000-8000-00000000e941'
SHOW_ID='00000000-0000-4000-8000-00000000a942'
OPEN_ID='00000000-0000-4000-8000-00000000b941'
DNV_ID='00000000-0000-4000-8000-00000000b942'
CLOSE_ID='00000000-0000-4000-8000-00000000b943'

log "Seeding one governed Jury window and organizer authority"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$ORGANIZER_ID','authenticated','authenticated','s5-jury-organizer@local.invalid',now(),now());
insert into public.countries(id,name,short_code) values
  ('$COUNTRY_A','S5 Jury A','J5A'),
  ('$COUNTRY_B','S5 Jury B','J5B'),
  ('$COUNTRY_C','S5 Jury C','J5C'),
  ('$COUNTRY_D','S5 Jury D','J5D');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Jury Consequences',2026,'s5-jury-consequences',9941,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
values ('$SHOW_ID','$EDITION_ID','S5 Jury Final','final',1,false,
  jsonb_build_object('juryEnabled',true,'juryPoints',jsonb_build_array(12,10),'allowSelfVote',false));
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order) values
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_A','Artist A','Song A',1),
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_B','Artist B','Song B',2),
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_C','Artist C','Song C',3);
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
values ('$EDITION_ID','$SHOW_ID','$COUNTRY_D','Jury D',1);
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
  ('$ORGANIZER_ID','voting.manage','$EDITION_ID'),
  ('$ORGANIZER_ID','jury.ballots.manage','$EDITION_ID');
"

log "Opening Jury through the canonical R2 window command"
OPEN_PREVIEW="$(as_user "$ORGANIZER_ID" "select public.studio2_jury_window_change_preview('$SHOW_ID'::uuid,'open')::text;")"
OPEN_VERSION="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedVersion"])' "$OPEN_PREVIEW")"
[[ "$OPEN_VERSION" =~ ^[0-9]+$ ]] || fail "Jury open preview omitted expectedVersion"
as_user "$ORGANIZER_ID" "select public.studio2_apply_jury_voting_status('$SHOW_ID'::uuid,'open','$OPEN_ID'::uuid,'s5-jury-open',$OPEN_VERSION);" >/dev/null

[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPEN_ID'::uuid and command='jury.window.open' and status='succeeded';")" == '1' ]] || fail "Jury open did not complete an S2 receipt"
OPEN_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$OPEN_ID'::uuid and event_type='jury.opened';")"
[[ -n "$OPEN_EVENT" ]] || fail "Jury open did not emit jury.opened"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT'::uuid and consumer_key in ('jury.tasks','jury.notifications');")" == '2' ]] || fail "Jury open did not persist both consequence deliveries"
[[ "$(db_value "select (payload ?| array['entries','votes','rankings','ballot'])::text from private.v3_domain_events where id='$OPEN_EVENT'::uuid;")" == 'false' ]] || fail "Jury event payload leaked ballot content"

log "Recording DNV through the governed Jury lifecycle"
DNV_PREVIEW="$(as_user "$ORGANIZER_ID" "select public.studio2_jury_dnv_preview('$SHOW_ID'::uuid,null,'$COUNTRY_D'::uuid,null,'set')::text;")"
DNV_VERSION="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedVersion"])' "$DNV_PREVIEW")"
[[ "$DNV_VERSION" =~ ^[0-9]+$ ]] || fail "Jury DNV preview omitted expectedVersion"
as_user "$ORGANIZER_ID" "select public.studio2_apply_jury_dnv('$SHOW_ID'::uuid,null,'$COUNTRY_D'::uuid,null,'set','Delegation did not vote','$DNV_ID'::uuid,'s5-jury-dnv',$DNV_VERSION);" >/dev/null

[[ "$(db_value "select count(*) from public.jury_ballot_statuses where show_id='$SHOW_ID'::uuid and voter_country_id='$COUNTRY_D'::uuid and status='did_not_vote';")" == '1' ]] || fail "Governed Jury DNV state was not persisted"
DNV_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$DNV_ID'::uuid and event_type='jury.ballot_changed';")"
[[ -n "$DNV_EVENT" ]] || fail "Jury DNV did not emit jury.ballot_changed"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$DNV_EVENT'::uuid and consumer_key='jury.tasks';")" == '1' ]] || fail "Jury DNV task consequence was not persisted"
[[ "$(db_value "select (payload ?| array['entries','votes','rankings','ballot'])::text from private.v3_domain_events where id='$DNV_EVENT'::uuid;")" == 'false' ]] || fail "Jury DNV event payload leaked ballot content"

log "Closing Jury through the same governed command"
CLOSE_PREVIEW="$(as_user "$ORGANIZER_ID" "select public.studio2_jury_window_change_preview('$SHOW_ID'::uuid,'closed')::text;")"
CLOSE_VERSION="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedVersion"])' "$CLOSE_PREVIEW")"
as_user "$ORGANIZER_ID" "select public.studio2_apply_jury_voting_status('$SHOW_ID'::uuid,'closed','$CLOSE_ID'::uuid,'s5-jury-close',$CLOSE_VERSION);" >/dev/null
CLOSE_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$CLOSE_ID'::uuid and event_type='jury.closed';")"
[[ -n "$CLOSE_EVENT" ]] || fail "Jury close did not emit jury.closed"

log "Claiming and completing Jury task consequences with service leases"
TASK_CLAIMS="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('jury.tasks','s5-jury-worker',100,60);")"
for event_id in "$OPEN_EVENT" "$DNV_EVENT" "$CLOSE_EVENT"; do
  printf '%s\n' "$TASK_CLAIMS" | grep -Fxq "$event_id" || fail "jury.tasks did not claim $event_id"
done
while IFS= read -r event_id; do
  [[ -n "$event_id" ]] || continue
  service_exec "select public.studio2_process_jury_domain_event('$event_id'::uuid,'jury.tasks','s5-jury-worker');"
done <<< "$TASK_CLAIMS"

[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id in ('$OPEN_EVENT'::uuid,'$DNV_EVENT'::uuid,'$CLOSE_EVENT'::uuid) and consumer_key='jury.tasks' and result_metadata->>'effect'='jury-task-reconciliation';")" == '3' ]] || fail "Jury task consumer receipts are incomplete"

log "Claiming the Jury-open notification consequence"
NOTIFY_CLAIMS="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('jury.notifications','s5-jury-notify-worker',100,60);")"
printf '%s\n' "$NOTIFY_CLAIMS" | grep -Fxq "$OPEN_EVENT" || fail "jury.notifications did not claim jury.opened"
service_exec "select public.studio2_process_jury_domain_event('$OPEN_EVENT'::uuid,'jury.notifications','s5-jury-notify-worker');"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$OPEN_EVENT'::uuid and consumer_key='jury.notifications' and result_metadata->>'effect'='jury-open-notification-evaluation';")" == '1' ]] || fail "Jury notification consumer receipt is missing"

log "Replay is idempotent and browser roles cannot run consequence consumers"
[[ "$(service_value "select public.studio2_process_jury_domain_event('$OPEN_EVENT'::uuid,'jury.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Jury task consequence replay was not idempotent"
expect_denied "authenticated Jury consequence processing" "select public.studio2_process_jury_domain_event('$OPEN_EVENT'::uuid,'jury.tasks','browser-worker');"

[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id in ('$OPEN_EVENT'::uuid,'$DNV_EVENT'::uuid,'$CLOSE_EVENT'::uuid) and status='completed';")" == '4' ]] || fail "Not all Jury consequence deliveries completed"

log "System V3 S5 Jury consequence rehearsal passed"
