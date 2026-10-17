#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-televote-deadline] %s\n' "$*"; }
fail() { printf '\n[v3-s14-televote-deadline] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

auth_sql() {
  local query="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query"
}

EDITION_ID='00000000-0000-4000-8000-00000000c101'
TV_EDITION='00000000-0000-4000-8000-00000000c102'
ROUND_ID='00000000-0000-4000-8000-00000000c103'
USER_ID='00000000-0000-4000-8000-00000000c104'
SET_OP='00000000-0000-4000-8000-00000000c105'
OPEN_OP='00000000-0000-4000-8000-00000000c106'
EXTEND_OP='00000000-0000-4000-8000-00000000c107'
STALE_OP='00000000-0000-4000-8000-00000000c108'
PREFLIGHT_ID='00000000-0000-4000-8000-00000000c109'

BALLOT='[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]'
BALLOT_MAP='{"A":4,"B":4,"C":4,"D":4,"E":4}'

log "Seeding isolated edition, governed actor and draft Televote round"
db_exec "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Televote Deadline','s14-televote-deadline',1420,2026,'active',false)
on conflict (id) do update set status='active',published=false;

insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s14-deadline@local.invalid',now(),now())
on conflict (id) do nothing;
insert into public.user_roles(user_id,role) values ('$USER_ID','organizer') on conflict do nothing;
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','voting.manage','$EDITION_ID'),('$USER_ID','voting.read','$EDITION_ID')
on conflict do nothing;

insert into televoting.editions(id,name,is_active,is_archived)
values ('$TV_EDITION','S14 Televote Deadline',true,false)
on conflict (id) do update set is_active=true,is_archived=false;

insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status)
values ('televoting','edition','$EDITION_ID','$TV_EDITION','$EDITION_ID','linked')
on conflict (service,entity_type,remote_id)
do update set solaris_id=excluded.solaris_id,edition_id=excluded.edition_id,sync_status='linked';

insert into televoting.countries(code,name) values ('HME','S14 Deadline Home')
on conflict (code) do update set name=excluded.name;

insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode,
  results_status,results_outdated,broadcast_display_mode
) values (
  '$ROUND_ID','$TV_EDITION','S14 genuine deadline round','draft',20,'countries','country_match',
  'draft',false,'converted'
)
on conflict (id) do update set status='draft',closes_at=null,results_status='draft',results_outdated=false;

insert into televoting.round_entries(round_id,entry_type,entry_key,custom_name,display_order)
select '$ROUND_ID'::uuid,'custom',target.key,'Deadline target ' || target.key,target.ord::int
from unnest(array['A','B','C','D','E']) with ordinality as target(key,ord)
on conflict (round_id,entry_key) do update set display_order=excluded.display_order;
"

INITIAL_VERSION="$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$ROUND_ID'::uuid;")"
INITIAL_DEADLINE="$(db_scalar "select (clock_timestamp() + interval '1 hour')::text;")"

log "Initial persisted deadline is a governed R2 operation"
PREVIEW="$(auth_sql "select televoting.studio2_round_deadline_change_preview('$ROUND_ID','$INITIAL_DEADLINE')::text;")"
python3 - "$PREVIEW" "$INITIAL_VERSION" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
assert p['action']=='set'
assert p['expectedRoundVersion']==int(sys.argv[2])
assert p['blockers']==[]
assert p['currentDeadline'] is None
PY

SET_RESULT="$(auth_sql "select televoting.studio2_apply_round_deadline_change('$ROUND_ID','$INITIAL_DEADLINE','$SET_OP','s14-deadline-set',$INITIAL_VERSION)::text;")"
python3 - "$SET_RESULT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['action']=='set'
assert r['previousDeadline'] is None
assert r['deadline'] is not None
assert r['roundVersion'] > r['previousRoundVersion']
PY

REPLAY_RESULT="$(auth_sql "select televoting.studio2_apply_round_deadline_change('$ROUND_ID','$INITIAL_DEADLINE','$SET_OP','s14-deadline-set',$INITIAL_VERSION)::text;")"
[[ "$REPLAY_RESULT" == "$SET_RESULT" ]] || fail "exact deadline-set replay changed canonical result"
[[ "$(db_scalar "select command from public.studio2_operation_receipts where operation_id='$SET_OP'::uuid;")" == "televote.deadline.change" ]] || fail "deadline operation command identity is not replay-stable"
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$SET_OP'::uuid and event_type='televote.deadline_set';")" == "1" ]] || fail "deadline-set DomainEvent missing or duplicated"

log "Opening the round preserves the future deadline and canonical open event"
GLOBAL_VERSION="$(db_scalar "select version from public.studio2_televote_global_versions where singleton=true;")"
ROUND_VERSION="$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$ROUND_ID'::uuid;")"
OPEN_RESULT="$(auth_sql "select televoting.studio2_apply_round_status_change('$ROUND_ID','open','$OPEN_OP','s14-open',$GLOBAL_VERSION,$ROUND_VERSION)::text;")"
python3 - "$OPEN_RESULT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['status']=='open'
PY
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$OPEN_OP'::uuid and event_type='televote.opened';")" == "1" ]] || fail "canonical televote.opened event missing"

log "Fixture advances the server deadline boundary without closing/reopening the round"
db_exec "update televoting.rounds set closes_at=clock_timestamp()-interval '1 second' where id='$ROUND_ID'::uuid;"
[[ "$(db_scalar "select status from televoting.rounds where id='$ROUND_ID'::uuid;")" == "open" ]] || fail "fixture changed round status while expiring deadline"

log "A real submit_vote_checked ballot is rejected after server deadline"
db_exec "
insert into televoting.vote_preflight_checks(
  id,round_id,channel,username_normalized,country_code,ballot_map,expires_at
) values (
  '$PREFLIGHT_ID','$ROUND_ID','televote','deadline voter','HME','$BALLOT_MAP'::jsonb,clock_timestamp()+interval '20 minutes'
);
"
db_expect_failure "public ballot after authoritative deadline" "set role anon; select televoting.submit_vote_checked('$ROUND_ID','Deadline Voter','HME','$BALLOT'::jsonb,'$PREFLIGHT_ID',null,null,null,null,false);"
[[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$ROUND_ID'::uuid and username_normalized='deadline voter';")" == "0" ]] || fail "expired ballot escaped the server deadline guard"

EXPIRED_VERSION="$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$ROUND_ID'::uuid;")"
EXTENDED_DEADLINE="$(db_scalar "select (clock_timestamp() + interval '1 hour')::text;")"

log "A governed extension changes the deadline without a closed->open shortcut"
EXT_PREVIEW="$(auth_sql "select televoting.studio2_round_deadline_change_preview('$ROUND_ID','$EXTENDED_DEADLINE')::text;")"
python3 - "$EXT_PREVIEW" "$EXPIRED_VERSION" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
assert p['status']=='open'
assert p['action']=='extend'
assert p['expectedRoundVersion']==int(sys.argv[2])
assert p['blockers']==[]
PY

EXT_RESULT="$(auth_sql "select televoting.studio2_apply_round_deadline_change('$ROUND_ID','$EXTENDED_DEADLINE','$EXTEND_OP','s14-deadline-extend',$EXPIRED_VERSION)::text;")"
python3 - "$EXT_RESULT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['status']=='open'
assert r['action']=='extend'
assert r['previousDeadline'] is not None
assert r['deadline'] is not None
assert r['roundVersion'] > r['previousRoundVersion']
PY

EXT_REPLAY="$(auth_sql "select televoting.studio2_apply_round_deadline_change('$ROUND_ID','$EXTENDED_DEADLINE','$EXTEND_OP','s14-deadline-extend',$EXPIRED_VERSION)::text;")"
[[ "$EXT_REPLAY" == "$EXT_RESULT" ]] || fail "exact extension replay changed canonical result"
[[ "$(db_scalar "select status from televoting.rounds where id='$ROUND_ID'::uuid;")" == "open" ]] || fail "extension changed the round lifecycle state"
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$EXTEND_OP'::uuid and event_type='televote.extended';")" == "1" ]] || fail "televote.extended event missing or duplicated"
[[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='$EXTEND_OP'::uuid and o.consumer_key='televote.tasks';")" == "1" ]] || fail "extension task consequence was not queued"

EVENT_PAYLOAD="$(db_scalar "select payload::text from private.v3_domain_events where operation_id='$EXTEND_OP'::uuid and event_type='televote.extended';")"
python3 - "$EVENT_PAYLOAD" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
assert p['previousDeadline'] is not None
assert p['deadline'] is not None
assert p['roundVersion'] > p['previousRoundVersion']
PY

log "Stale optimistic version and direct browser deadline edits fail closed"
LATER_DEADLINE="$(db_scalar "select (clock_timestamp() + interval '2 hours')::text;")"
db_expect_failure "stale deadline extension version" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select televoting.studio2_apply_round_deadline_change('$ROUND_ID','$LATER_DEADLINE','$STALE_OP','s14-stale',$EXPIRED_VERSION);"

DIRECT_BEFORE="$(db_scalar "select closes_at::text from televoting.rounds where id='$ROUND_ID'::uuid;")"
SCOPED_DIRECT_ROWS="$(auth_sql "with changed as (update televoting.rounds set closes_at=clock_timestamp()+interval '3 hours' where id='$ROUND_ID'::uuid returning id) select count(*) from changed;")"
[[ "$SCOPED_DIRECT_ROWS" == "0" ]] || fail "edition-scoped actor unexpectedly bypassed raw-round RLS"
[[ "$(db_scalar "select closes_at::text from televoting.rounds where id='$ROUND_ID'::uuid;")" == "$DIRECT_BEFORE" ]] || fail "edition-scoped direct edit changed the governed deadline"
log "PASS: edition-scoped direct deadline edit was rejected by raw-round RLS"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_ID','voting.manage',null) on conflict do nothing;"
[[ "$(auth_sql "select count(*) from televoting.rounds where id='$ROUND_ID'::uuid;")" == "1" ]] || fail "global voting.manage fixture cannot see raw round through RLS"
db_expect_failure "globally authorized direct deadline edit" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; update televoting.rounds set closes_at=clock_timestamp()+interval '3 hours' where id='$ROUND_ID'::uuid;"
[[ "$(db_scalar "select closes_at::text from televoting.rounds where id='$ROUND_ID'::uuid;")" == "$DIRECT_BEFORE" ]] || fail "trigger-rejected direct edit changed the governed deadline"

log "The same real preflight ballot succeeds inside the extended server window"
SUBMIT_RESULT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "set role anon; select televoting.submit_vote_checked('$ROUND_ID','Deadline Voter','HME','$BALLOT'::jsonb,'$PREFLIGHT_ID',null,null,null,null,false)::text;")"
python3 - "$SUBMIT_RESULT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['id']
assert r['preflight_id']
assert r['status'] in ('active','suspicious')
PY
[[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$ROUND_ID'::uuid and username_normalized='deadline voter' and status<>'deleted';")" == "1" ]] || fail "extended-window ballot was not committed exactly once"
[[ "$(db_scalar "select count(*) from private.v3_domain_events e join public.studio2_operation_receipts r on r.operation_id=e.operation_id where e.event_type='televote.ballot_submitted' and r.result->>'roundId'='$ROUND_ID';")" == "1" ]] || fail "accepted extended-window ballot lacks canonical ballot event"

log "Extension task consequence remains executable through the existing Televote consumer"
EVENT_ID="$(db_scalar "select id from private.v3_domain_events where operation_id='$EXTEND_OP'::uuid and event_type='televote.extended';")"
db_exec "set request.jwt.claim.role='service_role'; select * from public.studio2_claim_domain_event_deliveries('televote.tasks','s14-deadline-worker',25,300);"
PROCESS_RESULT="$(db_scalar "set request.jwt.claim.role='service_role'; select public.studio2_process_televote_domain_event('$EVENT_ID','televote.tasks','s14-deadline-worker')::text;")"
python3 - "$PROCESS_RESULT" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['status']=='completed'
PY

log "All S14 genuine Televote deadline extension checks passed"
