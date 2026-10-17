#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-prediction-score] %s\n' "$*"; }
fail() { printf '[v3-s5-prediction-score] ERROR: %s\n' "$*" >&2; exit 1; }

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

USER_ID='00000000-0000-4000-8000-00000000a951'
EDITION_ID='00000000-0000-4000-8000-00000000e951'
SHOW_ID='00000000-0000-4000-8000-00000000b951'
ROUND_ID='00000000-0000-4000-8000-00000000c951'
ENTRY_ID='00000000-0000-4000-8000-00000000d951'
COUNTRY_1='00000000-0000-4000-8000-00000000f951'
COUNTRY_2='00000000-0000-4000-8000-00000000f952'
PARTICIPANT_1='00000000-0000-4000-8000-00000000f953'
PARTICIPANT_2='00000000-0000-4000-8000-00000000f954'
OPERATION_1='00000000-0000-4000-8000-00000000a952'
OPERATION_STALE='00000000-0000-4000-8000-00000000a953'
OPERATION_2='00000000-0000-4000-8000-00000000a954'

db_exec() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
as_user_value() {
  local query="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query" | tail -n1 | tr -d '\r'
}
as_user_fails() {
  local query="$1"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query" >/dev/null 2>&1; then
    return 1
  fi
}

log "Seed one locked Prediction round with published results"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s5-prediction-score@local.invalid',now(),now());
insert into public.countries(id,name,short_code) values
  ('$COUNTRY_1','Prediction Score One','PS1'),
  ('$COUNTRY_2','Prediction Score Two','PS2');
insert into public.editions(id,name,slug,edition_number,status,published) values
  ('$EDITION_ID','S5 Prediction Score','s5-prediction-score',99511,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config,qualifier_count) values
  ('$SHOW_ID','$EDITION_ID','S5 Prediction Score Final','final',1,false,'{}'::jsonb,null);
insert into public.participants(id,edition_id,show_id,country_id,artist,song,semi_final) values
  ('$PARTICIPANT_1','$EDITION_ID','$SHOW_ID','$COUNTRY_1','Score Artist One','Score Song One','final'),
  ('$PARTICIPANT_2','$EDITION_ID','$SHOW_ID','$COUNTRY_2','Score Artist Two','Score Song Two','final');
update public.shows
set publication_config=private.studio2_normalise_publication_config('{\"participants\":true,\"results\":true}'::jsonb),
    published=true,
    updated_at=now()
where id='$SHOW_ID';
update public.studio2_show_publication_controls
set state='public',
    version=version+1,
    frozen_config=private.studio2_normalise_publication_config('{\"participants\":true,\"results\":true}'::jsonb),
    source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
    source_result_version=null,
    scheduled_for=null,
    scheduled_from_state=null,
    scheduled_by=null,
    scheduled_operation_id=null,
    last_failure=null,
    last_failure_at=null,
    updated_at=now()
where show_id='$SHOW_ID';
insert into public.results(edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank)
values
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_1',12,12,24,1),
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_2',10,10,20,2);
insert into public.prediction_rounds(id,show_id,opens_at,locks_at,status,prediction_types,scoring_version,consensus_minimum)
values ('$ROUND_ID','$SHOW_ID',now()-interval '2 hours',now()-interval '1 hour','locked',array['winner']::text[],'v1',5);
insert into public.fan_profiles(id,display_name) values ('$USER_ID','Score Operator');
insert into public.prediction_entries(id,round_id,profile_id,version,state,submitted_at,locked_at)
values ('$ENTRY_ID','$ROUND_ID','$USER_ID',1,'locked',now()-interval '90 minutes',now()-interval '1 hour');
insert into public.prediction_items(entry_id,country_id,prediction_type)
values ('$ENTRY_ID','$COUNTRY_1','winner');
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','voting.manage','$EDITION_ID')
on conflict do nothing;
"

log "Preview starts at score revision zero"
[[ "$(as_user_value "select public.studio2_prediction_score_preview('$ROUND_ID'::uuid)->>'scoreRevision';")" == '0' ]] || fail "initial score revision is not 0"

log "First score creates revision one and one event"
[[ "$(as_user_value "select public.studio2_score_prediction_round('$ROUND_ID'::uuid,'$OPERATION_1'::uuid,'prediction-score-1',0)->>'scoreRevision';")" == '1' ]] || fail "first score revision is not 1"
[[ "$(db_value "select version from public.studio2_prediction_score_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "score revision did not persist as 1"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_1'::uuid and event_type='prediction.scored' and aggregate_version=1;")" == '1' ]] || fail "revision-one prediction.scored missing"
[[ "$(db_value "select count(*) from public.prediction_scores where entry_id='$ENTRY_ID'::uuid;")" == '1' ]] || fail "score materialization missing"

log "Exact replay returns prior result without duplicate facts"
[[ "$(as_user_value "select public.studio2_score_prediction_round('$ROUND_ID'::uuid,'$OPERATION_1'::uuid,'prediction-score-1',0)->>'scoreRevision';")" == '1' ]] || fail "exact replay did not return revision one"
[[ "$(db_value "select version from public.studio2_prediction_score_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "exact replay advanced score revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_1'::uuid and event_type='prediction.scored';")" == '1' ]] || fail "exact replay duplicated prediction.scored"

log "Stale expected revision fails transactionally"
as_user_fails "select public.studio2_score_prediction_round('$ROUND_ID'::uuid,'$OPERATION_STALE'::uuid,'prediction-score-stale',0);" || fail "stale score revision unexpectedly succeeded"
[[ "$(db_value "select version from public.studio2_prediction_score_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "stale request changed score revision"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_STALE'::uuid;")" == '0' ]] || fail "failed stale claim escaped rollback"

log "A legitimate re-score advances revision one to two"
[[ "$(as_user_value "select public.studio2_score_prediction_round('$ROUND_ID'::uuid,'$OPERATION_2'::uuid,'prediction-score-2',1)->>'scoreRevision';")" == '2' ]] || fail "second score revision is not 2"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='prediction_round' and aggregate_id='$ROUND_ID' and event_type='prediction.scored';")" == '2' ]] || fail "prediction score history does not contain exactly two revisions"

log "Legacy scorer and revision table are not browser callable/readable"
as_user_fails "select public.score_prediction_round('$ROUND_ID'::uuid);" || fail "legacy direct scorer remains browser callable"
[[ "$(db_value "select has_table_privilege('authenticated','public.studio2_prediction_score_versions','SELECT');")" == 'f' ]] || fail "authenticated can read server-owned score revisions directly"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_id='$ROUND_ID' and (payload ? 'profileId' or payload ? 'userId' or payload ? 'predictionItems');")" == '0' ]] || fail "prediction score event leaked private prediction data"

log "System V3 S5 Prediction score consequence rehearsal passed"
