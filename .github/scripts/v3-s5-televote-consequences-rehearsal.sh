#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-televote-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-televote-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

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
as_anon() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role anon; set request.jwt.claim.role='anon'; $sql"
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

ORGANIZER_ID='00000000-0000-4000-8000-00000000a951'
EDITION_ID='00000000-0000-4000-8000-00000000e951'
SHOW_ID='00000000-0000-4000-8000-00000000a952'
TV_EDITION_ID='00000000-0000-4000-8000-00000000e952'
ROUND_ID='00000000-0000-4000-8000-00000000a953'
OPEN_ID='00000000-0000-4000-8000-00000000b951'
PREFLIGHT_ID='00000000-0000-4000-8000-00000000f951'
CLOSE_ID='00000000-0000-4000-8000-00000000b952'
BALLOT='[{"target_country_code":"T51","points":6},{"target_country_code":"T52","points":5},{"target_country_code":"T53","points":4},{"target_country_code":"T54","points":3},{"target_country_code":"T55","points":2}]'
BALLOT_MAP='{"T51":6,"T52":5,"T53":4,"T54":3,"T55":2}'

log "Seeding one linked canonical Televote round"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$ORGANIZER_ID','authenticated','authenticated','s5-televote-organizer@local.invalid',now(),now());
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Televote Consequences',2026,'s5-televote-consequences',9951,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published)
values ('$SHOW_ID','$EDITION_ID','S5 Televote Final','final',1,false);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ORGANIZER_ID','voting.manage','$EDITION_ID');
insert into televoting.countries(code,name) values
  ('VOT','S5 Voter'),('T51','Target 51'),('T52','Target 52'),('T53','Target 53'),('T54','Target 54'),('T55','Target 55');
insert into televoting.editions(id,name,is_active,is_archived)
values ('$TV_EDITION_ID','S5 Televote Remote',true,false);
insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at)
values ('televoting','edition','$EDITION_ID'::uuid,'$TV_EDITION_ID','$EDITION_ID'::uuid,'linked','{\"source\":\"s5-televote-consequences\"}'::jsonb,now())
on conflict (service,entity_type,remote_id) do update set
  solaris_id=excluded.solaris_id,edition_id=excluded.edition_id,sync_status='linked',metadata=excluded.metadata,last_synced_at=now(),updated_at=now();
insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('$ROUND_ID','$TV_EDITION_ID','S5 Televote Round','draft',20,'countries','country_match');
insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order) values
  ('$ROUND_ID','country','T51','T51','Target 51','T51',1),
  ('$ROUND_ID','country','T52','T52','Target 52','T52',2),
  ('$ROUND_ID','country','T53','T53','Target 53','T53',3),
  ('$ROUND_ID','country','T54','T54','Target 54','T54',4),
  ('$ROUND_ID','country','T55','T55','Target 55','T55',5);
insert into public.televoting_round_bindings(
  remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,frozen_at,created_at,updated_at
) values ('$ROUND_ID','$TV_EDITION_ID','$EDITION_ID'::uuid,'$SHOW_ID'::uuid,'show',now(),null,now(),now())
on conflict (remote_round_id) do update set
  remote_edition_id=excluded.remote_edition_id,edition_id=excluded.edition_id,show_id=excluded.show_id,
  source_mode='show',last_synced_at=now(),frozen_at=null,updated_at=now();
"

log "Opening Televote through the canonical R2 round command"
OPEN_PREVIEW="$(as_user "$ORGANIZER_ID" "select televoting.studio2_round_status_change_preview('$ROUND_ID'::uuid,'open')::text;")"
OPEN_GLOBAL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedGlobalVersion"])' "$OPEN_PREVIEW")"
OPEN_ROUND="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedRoundVersion"])' "$OPEN_PREVIEW")"
BLOCKERS="$(python3 -c 'import json,sys; import json as j; print(j.dumps(json.loads(sys.argv[1])["blockers"],separators=(",",":")))' "$OPEN_PREVIEW")"
[[ "$BLOCKERS" == '[]' ]] || fail "Televote open preview returned blockers: $OPEN_PREVIEW"
as_user "$ORGANIZER_ID" "select televoting.studio2_apply_round_status_change('$ROUND_ID'::uuid,'open','$OPEN_ID'::uuid,'s5-televote-open',$OPEN_GLOBAL,$OPEN_ROUND);" >/dev/null

[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPEN_ID'::uuid and command='televote.round.open' and status='succeeded';")" == '1' ]] || fail "Televote open did not complete an S2 receipt"
OPEN_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$OPEN_ID'::uuid and event_type='televote.opened';")"
[[ -n "$OPEN_EVENT" ]] || fail "Televote open did not emit televote.opened"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT'::uuid and consumer_key in ('televote.tasks','televote.notifications');")" == '2' ]] || fail "Televote open did not persist both consequence deliveries"

log "Submitting a real ballot through the one-shot integrity authority"
db_exec "
insert into televoting.vote_preflight_checks(
  id,round_id,username_normalized,country_code,ballot_map,risk_score,severity,
  requires_attestation,findings,technical_signals,channel,canonical_edition_id,expires_at
) values (
  '$PREFLIGHT_ID','$ROUND_ID','s5_televoter','VOT','$BALLOT_MAP'::jsonb,0,'none',
  false,'[]'::jsonb,'[]'::jsonb,'televote','$EDITION_ID',now()+interval '30 minutes'
);
"
SUBMIT_RESULT="$(as_anon "select televoting.submit_vote_checked('$ROUND_ID'::uuid,'s5_televoter','VOT','$BALLOT'::jsonb,'$PREFLIGHT_ID'::uuid,null,null,null,null,false)::text;")"
SUBMISSION_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "$SUBMIT_RESULT")"
[[ -n "$SUBMISSION_ID" ]] || fail "Televote submission returned no canonical id"
[[ "$(db_value "select count(*) from televoting.vote_entries where submission_id='$SUBMISSION_ID'::uuid;")" == '5' ]] || fail "Canonical Televote ballot rows were not persisted"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$PREFLIGHT_ID'::uuid and command='televote.submit' and status='succeeded';")" == '1' ]] || fail "Televote submit was not bridged to S2"
BALLOT_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$PREFLIGHT_ID'::uuid and event_type='televote.ballot_submitted';")"
[[ -n "$BALLOT_EVENT" ]] || fail "Televote ballot did not emit televote.ballot_submitted"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$BALLOT_EVENT'::uuid and consumer_key='televote.tasks';")" == '1' ]] || fail "Televote ballot task consequence was not persisted"
[[ "$(db_value "select (payload ?| array['entries','votes','points','ballot','ballotMap','username','countryCode'])::text from private.v3_domain_events where id='$BALLOT_EVENT'::uuid;")" == 'false' ]] || fail "Televote DomainEvent payload leaked ballot or voter content"

log "Closing Televote through the canonical round command"
CLOSE_PREVIEW="$(as_user "$ORGANIZER_ID" "select televoting.studio2_round_status_change_preview('$ROUND_ID'::uuid,'closed')::text;")"
CLOSE_GLOBAL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedGlobalVersion"])' "$CLOSE_PREVIEW")"
CLOSE_ROUND="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["expectedRoundVersion"])' "$CLOSE_PREVIEW")"
as_user "$ORGANIZER_ID" "select televoting.studio2_apply_round_status_change('$ROUND_ID'::uuid,'closed','$CLOSE_ID'::uuid,'s5-televote-close',$CLOSE_GLOBAL,$CLOSE_ROUND);" >/dev/null
CLOSE_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$CLOSE_ID'::uuid and event_type='televote.closed';")"
[[ -n "$CLOSE_EVENT" ]] || fail "Televote close did not emit televote.closed"

log "Claiming and completing Televote task consequences with service leases"
TASK_CLAIMS="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('televote.tasks','s5-televote-worker',100,60);")"
for event_id in "$OPEN_EVENT" "$BALLOT_EVENT" "$CLOSE_EVENT"; do
  printf '%s\n' "$TASK_CLAIMS" | grep -Fxq "$event_id" || fail "televote.tasks did not claim $event_id"
done
while IFS= read -r event_id; do
  [[ -n "$event_id" ]] || continue
  service_exec "select public.studio2_process_televote_domain_event('$event_id'::uuid,'televote.tasks','s5-televote-worker');"
done <<< "$TASK_CLAIMS"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id in ('$OPEN_EVENT'::uuid,'$BALLOT_EVENT'::uuid,'$CLOSE_EVENT'::uuid) and consumer_key='televote.tasks' and result_metadata->>'effect'='televote-task-reconciliation';")" == '3' ]] || fail "Televote task consumer receipts are incomplete"

log "Claiming the Televote-open notification consequence"
NOTIFY_CLAIMS="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('televote.notifications','s5-televote-notify-worker',100,60);")"
printf '%s\n' "$NOTIFY_CLAIMS" | grep -Fxq "$OPEN_EVENT" || fail "televote.notifications did not claim televote.opened"
service_exec "select public.studio2_process_televote_domain_event('$OPEN_EVENT'::uuid,'televote.notifications','s5-televote-notify-worker');"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$OPEN_EVENT'::uuid and consumer_key='televote.notifications' and result_metadata->>'effect'='televote-open-notification-evaluation';")" == '1' ]] || fail "Televote notification consumer receipt is missing"

log "Replay is idempotent and browser roles cannot run consequence consumers"
[[ "$(service_value "select public.studio2_process_televote_domain_event('$BALLOT_EVENT'::uuid,'televote.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Televote task consequence replay was not idempotent"
expect_denied "authenticated Televote consequence processing" "select public.studio2_process_televote_domain_event('$BALLOT_EVENT'::uuid,'televote.tasks','browser-worker');"

[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id in ('$OPEN_EVENT'::uuid,'$BALLOT_EVENT'::uuid,'$CLOSE_EVENT'::uuid) and status='completed';")" == '4' ]] || fail "Not all Televote consequence deliveries completed"

log "System V3 S5 Televote consequence rehearsal passed"
