#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-results-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-results-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

COUNTRY_ID='00000000-0000-4000-8000-00000000c961'
EDITION_ID='00000000-0000-4000-8000-00000000e961'
SHOW_ID='00000000-0000-4000-8000-00000000a961'
RESULT_ID='00000000-0000-4000-8000-00000000d961'
CALCULATE_ID='00000000-0000-4000-8000-00000000b961'
REVIEW_ID='00000000-0000-4000-8000-00000000b962'
LOCK_ID='00000000-0000-4000-8000-00000000b963'

log "Seeding one exact canonical result version"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S5 Results Country','S5R');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S5 Results Consequences',2026,'s5-results-consequences',9961,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published) values ('$SHOW_ID','$EDITION_ID','S5 Results Final','final',1,false);"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',12,10,22,1);"
db_exec "insert into public.studio2_result_operations(show_id,edition_id,calculation_version,reviewed_version,locked_version) values ('$SHOW_ID','$EDITION_ID',1,1,1);"

insert_execution() {
  local execution_id="$1" action="$2"
  db_exec "insert into public.studio2_result_operation_executions(execution_id,edition_id,show_id,action,calculation_version,reason,payload) values ('$execution_id','$EDITION_ID','$SHOW_ID','$action',1,'S5 consequence rehearsal',jsonb_build_object('executionId','$execution_id','showId','$SHOW_ID','editionId','$EDITION_ID','action','$action','calculationVersion',1));"
}

log "Completed calculate/review/lock facts bridge to distinct S2/S4 facts at the same result version"
insert_execution "$CALCULATE_ID" calculate
insert_execution "$REVIEW_ID" review
insert_execution "$LOCK_ID" lock

[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and status='succeeded';")" == '3' ]] || fail "Results executions did not bridge to three successful S2 operations"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and event_type in ('results.calculated','results.verified','results.locked') and aggregate_id='$SHOW_ID' and aggregate_version=1;")" == '3' ]] || fail "Results facts collided or were not emitted"
[[ "$(db_value "select count(distinct event_type) from private.v3_domain_events where operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid);")" == '3' ]] || fail "Results fact identity collapsed different lifecycle facts"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and o.consumer_key='results.tasks';")" == '3' ]] || fail "Results task deliveries were not persisted transactionally"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and (edition_id is distinct from '$EDITION_ID'::uuid or show_id is distinct from '$SHOW_ID'::uuid);")" == '0' ]] || fail "Results event scope drifted from canonical show/edition identity"

log "Claiming and completing every Results consequence under a service lease"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('results.tasks','s5-results-worker',100,60);")"
for operation_id in "$CALCULATE_ID" "$REVIEW_ID" "$LOCK_ID"; do
  event_id="$(db_value "select id::text from private.v3_domain_events where operation_id='$operation_id'::uuid;")"
  printf '%s\n' "$CLAIMED" | grep -Fxq "$event_id" || fail "results.tasks did not claim $event_id"
done
while IFS= read -r event_id; do
  [[ -n "$event_id" ]] || continue
  service_exec "select public.studio2_process_results_domain_event('$event_id'::uuid,'results.tasks','s5-results-worker');"
done <<< "$CLAIMED"

[[ "$(db_value "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and o.consumer_key='results.tasks' and o.status='completed';")" == '3' ]] || fail "Results consequence deliveries did not complete"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts r join private.v3_domain_events e on e.id=r.event_id where e.operation_id in ('$CALCULATE_ID'::uuid,'$REVIEW_ID'::uuid,'$LOCK_ID'::uuid) and r.consumer_key='results.tasks' and r.result_metadata->>'effect'='results-task-reconciliation';")" == '3' ]] || fail "Results consumer receipts are incomplete"

FIRST_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$CALCULATE_ID'::uuid;")"
[[ "$(service_value "select public.studio2_process_results_domain_event('$FIRST_EVENT'::uuid,'results.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Results consumer replay was not idempotent"

log "Browser roles cannot execute service-only Results consequences"
HTTP_CODE="$(curl -sS -o /tmp/v3-s5-results-body -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/studio2_process_results_domain_event" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' --data "{\"p_event_id\":\"$FIRST_EVENT\",\"p_consumer_key\":\"results.tasks\",\"p_worker_id\":\"browser-worker\"}")"
(( HTTP_CODE >= 400 )) || fail "anonymous Results consequence processing unexpectedly succeeded: $(cat /tmp/v3-s5-results-body)"
rm -f /tmp/v3-s5-results-body

log "Unsupported result lifecycle actions do not become falsely relabelled facts"
UNLOCK_ID='00000000-0000-4000-8000-00000000b964'
insert_execution "$UNLOCK_ID" unlock
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$UNLOCK_ID'::uuid;")" == '0' ]] || fail "unlock was falsely bridged as a declared Results event"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$UNLOCK_ID'::uuid;")" == '0' ]] || fail "unlock emitted a false Results DomainEvent"

QUAL_EDITION_ID='00000000-0000-4000-8000-00000000e971'
QUAL_SEMI_ONE_ID='00000000-0000-4000-8000-00000000a971'
QUAL_SEMI_TWO_ID='00000000-0000-4000-8000-00000000a972'

log "Rehearsing synchronous Results-version to canonical qualification convergence"
db_exec "
insert into public.countries(id,name,short_code,region)
select
  ('00000000-0000-4000-8a00-' || lpad(i::text,12,'0'))::uuid,
  'S5 Qualifier ' || lpad(i::text,2,'0'),
  'Q' || lpad(i::text,2,'0'),
  'S5Q'
from generate_series(1,24) i;

insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$QUAL_EDITION_ID','S5 Qualification Convergence',2026,'s5-qualification-convergence',9971,'active',false);

insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
values
  ('$QUAL_SEMI_ONE_ID','$QUAL_EDITION_ID','S5 Qualification Semi 1','semi-final',1,false,'{\"qualifiers\":10}'::jsonb),
  ('$QUAL_SEMI_TWO_ID','$QUAL_EDITION_ID','S5 Qualification Semi 2','semi-final',2,false,'{\"qualifiers\":10}'::jsonb);

insert into public.participants(
  id,edition_id,show_id,country_id,artist,song,running_order,participation_status,qualified
)
select
  ('00000000-0000-4000-8b00-' || lpad(i::text,12,'0'))::uuid,
  '$QUAL_EDITION_ID'::uuid,
  case when i <= 12 then '$QUAL_SEMI_ONE_ID'::uuid else '$QUAL_SEMI_TWO_ID'::uuid end,
  ('00000000-0000-4000-8a00-' || lpad(i::text,12,'0'))::uuid,
  'S5 Qualifier Artist ' || lpad(i::text,2,'0'),
  'S5 Qualifier Song ' || lpad(i::text,2,'0'),
  case when i <= 12 then i else i - 12 end,
  'confirmed',
  false
from generate_series(1,24) i;

insert into public.results(
  id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank
)
select
  ('00000000-0000-4000-8c00-' || lpad(i::text,12,'0'))::uuid,
  '$QUAL_EDITION_ID'::uuid,
  case when i <= 12 then '$QUAL_SEMI_ONE_ID'::uuid else '$QUAL_SEMI_TWO_ID'::uuid end,
  ('00000000-0000-4000-8a00-' || lpad(i::text,12,'0'))::uuid,
  0,0,0,
  case when i <= 12 then i else i - 12 end
from generate_series(1,24) i;

update public.participants
set qualified=false
where edition_id='$QUAL_EDITION_ID'::uuid;

insert into public.studio2_result_operations(show_id,edition_id,calculation_version)
values
  ('$QUAL_SEMI_ONE_ID','$QUAL_EDITION_ID',0),
  ('$QUAL_SEMI_TWO_ID','$QUAL_EDITION_ID',0);
"

[[ "$(db_value "select count(*) from public.participants where edition_id='$QUAL_EDITION_ID'::uuid and qualified is true;")" == '0' ]] || fail "Qualification fixture was not stale before version transition"

db_exec "update public.studio2_result_operations set calculation_version=1,last_calculated_at=now(),updated_at=now() where show_id='$QUAL_SEMI_ONE_ID'::uuid;"

[[ "$(db_value "select count(*) from public.participants where edition_id='$QUAL_EDITION_ID'::uuid and qualified is true;")" == '20' ]] || fail "Results version transition did not converge exactly 20 canonical qualifiers"
[[ "$(db_value "select count(*) from (select show_id,count(*) as c from public.participants where edition_id='$QUAL_EDITION_ID'::uuid and qualified is true group by show_id having count(*)=10) qualified_shows;")" == '2' ]] || fail "Results version transition did not converge ten qualifiers per semi-final"
[[ "$(db_value "select count(*) from public.participants participant join public.results result_row on result_row.show_id=participant.show_id and result_row.country_id=participant.country_id where participant.edition_id='$QUAL_EDITION_ID'::uuid and participant.qualified is true and result_row.final_rank between 1 and 10;")" == '20' ]] || fail "Qualified projection is not backed by canonical top-ten result rank truth"
[[ "$(db_value "select count(*) from public.results result_row join public.participants participant on participant.show_id=result_row.show_id and participant.country_id=result_row.country_id where result_row.edition_id='$QUAL_EDITION_ID'::uuid and result_row.final_rank between 1 and 10 and participant.qualified is not true;")" == '0' ]] || fail "A canonical top-ten result failed to project as qualified"
log "S5_RESULT_QUALIFICATION_CONVERGENCE_COMPLETE"

log "System V3 S5 Results consequence rehearsal passed"
