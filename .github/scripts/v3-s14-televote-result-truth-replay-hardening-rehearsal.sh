#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-televote-replay-hardening] %s\n' "$*"; }
fail() { printf '\n[v3-s14-televote-replay-hardening] FAIL: %s\n' "$*" >&2; exit 1; }

if [[ -z "${DB_URL:-}" ]]; then eval "$(supabase status -o env)"; fi
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
  log "PASS: $label rejected and rolled back"
}

# Dispose only this rehearsal's instrumentation; it must never become runtime
# authority evidence or affect subsequent rehearsals/catalog collection.
cleanup_instrumentation() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "drop trigger if exists v3_s14_replay_force_sync_failure on public.results; drop trigger if exists v3_s14_replay_count_result_update on public.results; drop function if exists private.v3_s14_replay_force_sync_failure(); drop function if exists private.v3_s14_replay_count_result_update();" >/dev/null
}
trap cleanup_instrumentation EXIT

EDITION_ID='00000000-0000-4000-8000-00000000c201'
SHOW_ID='00000000-0000-4000-8000-00000000c202'
COUNTRY_A='00000000-0000-4000-8000-00000000c211'
COUNTRY_B='00000000-0000-4000-8000-00000000c212'
COUNTRY_C='00000000-0000-4000-8000-00000000c213'
PARTICIPANT_A='00000000-0000-4000-8000-00000000c221'
PARTICIPANT_B='00000000-0000-4000-8000-00000000c222'
PARTICIPANT_C='00000000-0000-4000-8000-00000000c223'
TV_EDITION='00000000-0000-4000-8000-00000000c230'
ROUND_ID='00000000-0000-4000-8000-00000000c231'

log "Seeding an isolated three-entry show for replay/churn measurement"
db_exec "
insert into public.countries(id,name,short_code,region) values
  ('$COUNTRY_A','S14 Harden A','THA','S14 hardening'),
  ('$COUNTRY_B','S14 Harden B','THB','S14 hardening'),
  ('$COUNTRY_C','S14 Harden C','THC','S14 hardening')
on conflict (id) do update set name=excluded.name,short_code=excluded.short_code,region=excluded.region;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Replay Hardening','s14-replay-hardening',1420,2026,'active',false)
on conflict (id) do update set name=excluded.name,status='active',published=false;

insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config,publication_config)
values ('$SHOW_ID','$EDITION_ID','S14 Replay Hardening Final','grand-final',1,false,
  '{\"juryEnabled\":false,\"televoteEnabled\":true,\"tieBreak\":[\"televote\",\"runningOrder\"]}'::jsonb,
  '{}'::jsonb)
on conflict (id) do update set voting_config=excluded.voting_config,published=false;

insert into public.participants(id,edition_id,show_id,country_id,artist,song,running_order,participation_status) values
  ('$PARTICIPANT_A','$EDITION_ID','$SHOW_ID','$COUNTRY_A','Hardening Artist A','Hardening Song A',1,'confirmed'),
  ('$PARTICIPANT_B','$EDITION_ID','$SHOW_ID','$COUNTRY_B','Hardening Artist B','Hardening Song B',2,'confirmed'),
  ('$PARTICIPANT_C','$EDITION_ID','$SHOW_ID','$COUNTRY_C','Hardening Artist C','Hardening Song C',3,'confirmed')
on conflict (id) do update set show_id=excluded.show_id,country_id=excluded.country_id,participation_status='confirmed';

insert into televoting.editions(id,name,is_active,is_archived)
values ('$TV_EDITION','S14 Replay Hardening',true,false)
on conflict (id) do update set is_active=true,is_archived=false;

insert into televoting.countries(code,name,flag) values
  ('THA','S14 Harden A','A'),('THB','S14 Harden B','B'),('THC','S14 Harden C','C')
on conflict (code) do update set name=excluded.name;

insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode,
  results_status,calculation_version,calculated_at,results_outdated,broadcast_display_mode
) values (
  '$ROUND_ID','$TV_EDITION','S14 replay round','closed',24,'countries','country_match',
  'calculated',1,'2026-10-17T07:00:00Z',false,'converted'
)
on conflict (id) do update set
  results_status='calculated',calculation_version=1,calculated_at='2026-10-17T07:00:00Z',
  results_outdated=false,broadcast_display_mode='converted';

insert into public.televoting_round_bindings(
  remote_round_id,remote_edition_id,edition_id,show_id,source_mode
) values ('$ROUND_ID','$TV_EDITION','$EDITION_ID','$SHOW_ID','show')
on conflict (remote_round_id) do update set edition_id=excluded.edition_id,show_id=excluded.show_id,source_mode='show';

delete from televoting.round_results where round_id='$ROUND_ID'::uuid;
insert into televoting.round_results(
  round_id,country_code,original_votes,original_voters,original_rank,participant_count,
  rank_base,rank_exponent,rank_factor,weighted_score,exact_points,floored_points,
  decimal_remainder,remainder_bonus,final_points,total_points_to_distribute,
  calculation_version,calculated_at
) values
  ('$ROUND_ID','THA',30,3,1,3,3,1.33,1,1,12,12,0,0,12,24,1,'2026-10-17T07:00:00Z'),
  ('$ROUND_ID','THB',20,3,2,3,3,1.33,1,1,8,8,0,0,8,24,1,'2026-10-17T07:00:00Z'),
  ('$ROUND_ID','THC',10,3,3,3,3,1.33,1,1,4,4,0,0,4,24,1,'2026-10-17T07:00:00Z');

update televoting.rounds set results_status='published' where id='$ROUND_ID'::uuid;
"
[[ "$(db_scalar "select count(*) || ':' || sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3:24" ]] || fail "baseline projection was not materialized"
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "1" ]] || fail "baseline provenance revision is not 1"

log "Installing local-only result-update instrumentation"
db_exec "
create table if not exists private.v3_s14_replay_result_updates (
  id bigint generated always as identity primary key,
  show_id uuid not null
);
truncate private.v3_s14_replay_result_updates;

create or replace function private.v3_s14_replay_count_result_update()
returns trigger language plpgsql set search_path=pg_catalog,private as \$audit\$
begin
  insert into private.v3_s14_replay_result_updates(show_id) values (new.show_id);
  return new;
end
\$audit\$;

drop trigger if exists v3_s14_replay_count_result_update on public.results;
create trigger v3_s14_replay_count_result_update
after update on public.results
for each row execute function private.v3_s14_replay_count_result_update();
"

log "Measuring one canonical show-result reconciliation as the amplification baseline"
db_exec "truncate private.v3_s14_replay_result_updates; select public.sync_show_results_from_votes('$SHOW_ID'::uuid);"
BASELINE_RESULT_UPDATES="$(db_scalar "select count(*) from private.v3_s14_replay_result_updates where show_id='$SHOW_ID'::uuid;")"
[[ "$BASELINE_RESULT_UPDATES" =~ ^[1-9][0-9]*$ ]] || fail "canonical result sync produced no measurable result updates"
db_exec "truncate private.v3_s14_replay_result_updates;"
log "PASS: one canonical result sync produces $BASELINE_RESULT_UPDATES result-row updates in the current engine"

log "Healthy exact replay must be an operational no-op"
REPLAY="$(db_scalar "select private.v3_sync_published_televote_round('$ROUND_ID'::uuid)::text;")"
python3 - "$REPLAY" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['replayed'] is True
assert payload['repaired'] is False
assert payload['projectionRevision'] == 1
PY
[[ "$(db_scalar "select count(*) from private.v3_s14_replay_result_updates where show_id='$SHOW_ID'::uuid;")" == "0" ]] || fail "healthy replay churned the derived result projection"
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "1" ]] || fail "healthy replay changed projection revision"
log "PASS: healthy replay performs zero result-row updates"

log "Privileged projection drift is repaired without semantic revision churn"
db_exec "
begin;
select set_config('solaris.v3_televote_projection_write','1',true);
update public.televote_votes set points=99
where show_id='$SHOW_ID'::uuid and country_id='$COUNTRY_A'::uuid;
commit;
truncate private.v3_s14_replay_result_updates;
"
[[ "$(db_scalar "select sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "111" ]] || fail "drift injection did not alter the materialized projection"

REPAIR="$(db_scalar "select private.v3_sync_published_televote_round('$ROUND_ID'::uuid)::text;")"
python3 - "$REPAIR" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['replayed'] is True
assert payload['repaired'] is True
assert payload['projectionRevision'] == 1
PY
[[ "$(db_scalar "select count(*) || ':' || sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3:24" ]] || fail "exact replay did not repair projection drift"
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "1" ]] || fail "repair invented a semantic projection revision"
[[ "$(db_scalar "select count(*) from private.v3_s14_replay_result_updates where show_id='$SHOW_ID'::uuid;")" == "$BASELINE_RESULT_UPDATES" ]] || fail "repair amplified derived-result reconciliation beyond one canonical show sync"
log "PASS: drift repair performs exactly one canonical reconciliation and preserves revision"

log "Post-repair exact replay returns to zero churn"
db_exec "truncate private.v3_s14_replay_result_updates;"
db_exec "select private.v3_sync_published_televote_round('$ROUND_ID'::uuid);"
[[ "$(db_scalar "select count(*) from private.v3_s14_replay_result_updates where show_id='$SHOW_ID'::uuid;")" == "0" ]] || fail "post-repair healthy replay still churned results"

log "A genuine superseding projection runs exactly one canonical result sync"
db_exec "truncate private.v3_s14_replay_result_updates;"
db_exec "
update televoting.round_results
set calculation_version=2,
    final_points=case country_code when 'THA' then 10 when 'THB' then 9 else 5 end,
    calculated_at='2026-10-17T07:10:00Z'
where round_id='$ROUND_ID'::uuid;
update televoting.rounds
set calculation_version=2,calculated_at='2026-10-17T07:10:00Z'
where id='$ROUND_ID'::uuid;
"
[[ "$(db_scalar "select source_version || ':' || projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "2:2" ]] || fail "superseding projection did not advance exactly once"
[[ "$(db_scalar "select count(*) from private.v3_s14_replay_result_updates where show_id='$SHOW_ID'::uuid;")" == "$BASELINE_RESULT_UPDATES" ]] || fail "bulk replacement amplified result reconciliation beyond one canonical show sync"
log "PASS: genuine replacement causes exactly one canonical result reconciliation"

log "Failure in the final canonical sync must roll back projection and provenance together"
db_exec "
create or replace function private.v3_s14_replay_force_sync_failure()
returns trigger language plpgsql set search_path=pg_catalog as \$fail_sync\$
begin
  raise exception 'S14 rehearsal forced result sync failure';
end
\$fail_sync\$;
drop trigger if exists v3_s14_replay_force_sync_failure on public.results;
create trigger v3_s14_replay_force_sync_failure
before update on public.results
for each row
when (new.show_id = '$SHOW_ID'::uuid)
execute function private.v3_s14_replay_force_sync_failure();
"
ROWS_V3="[{\"country_id\":\"$COUNTRY_A\",\"points\":8},{\"country_id\":\"$COUNTRY_B\",\"points\":9},{\"country_id\":\"$COUNTRY_C\",\"points\":7}]"
db_expect_failure "replacement whose final result sync fails" "select private.v3_apply_published_televote_projection('$EDITION_ID','$SHOW_ID','round','$ROUND_ID',3,'2026-10-17T07:20:00Z','$ROWS_V3'::jsonb);"
[[ "$(db_scalar "select source_version || ':' || projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "2:2" ]] || fail "failed final sync changed provenance"
[[ "$(db_scalar "select count(*) || ':' || sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3:24" ]] || fail "failed final sync left partial Televote projection writes"
db_exec "drop trigger if exists v3_s14_replay_force_sync_failure on public.results;"
log "PASS: failed final reconciliation rolls the bulk replacement back atomically"

log "All S14 Televote replay hardening checks passed"
