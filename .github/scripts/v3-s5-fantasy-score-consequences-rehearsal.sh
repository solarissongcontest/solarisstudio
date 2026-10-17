#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-fantasy-score] %s\n' "$*"; }
fail() { printf '[v3-s5-fantasy-score] ERROR: %s\n' "$*" >&2; exit 1; }

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

USER_ID='00000000-0000-4000-8000-00000000a971'
EDITION_ID='00000000-0000-4000-8000-00000000e971'
SHOW_ID='00000000-0000-4000-8000-00000000b971'
GAME_ID='00000000-0000-4000-8000-00000000c971'
TEAM_ID='00000000-0000-4000-8000-00000000d971'
COUNTRY_1='00000000-0000-4000-8000-00000000f971'
COUNTRY_2='00000000-0000-4000-8000-00000000f972'
PARTICIPANT_1='00000000-0000-4000-8000-00000000f973'
PARTICIPANT_2='00000000-0000-4000-8000-00000000f974'
OPERATION_1='00000000-0000-4000-8000-00000000a972'
OPERATION_STALE='00000000-0000-4000-8000-00000000a973'
OPERATION_2='00000000-0000-4000-8000-00000000a974'

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

log "Seed one locked Fantasy game, one team and published results"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s5-fantasy-score@local.invalid',now(),now());
insert into public.countries(id,name,short_code) values
  ('$COUNTRY_1','Fantasy Score One','FS1'),
  ('$COUNTRY_2','Fantasy Score Two','FS2');
insert into public.editions(id,name,slug,edition_number,status,published) values
  ('$EDITION_ID','S5 Fantasy Score','s5-fantasy-score',99711,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config,qualifier_count) values
  ('$SHOW_ID','$EDITION_ID','S5 Fantasy Score Final','final',1,false,'{}'::jsonb,null);
insert into public.participants(id,edition_id,show_id,country_id,artist,song,semi_final,qualified) values
  ('$PARTICIPANT_1','$EDITION_ID','$SHOW_ID','$COUNTRY_1','Fantasy Artist One','Fantasy Song One','final',true),
  ('$PARTICIPANT_2','$EDITION_ID','$SHOW_ID','$COUNTRY_2','Fantasy Artist Two','Fantasy Song Two','final',false);
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
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_1',120,140,260,1),
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_2',80,90,170,2);
insert into public.fan_profiles(id,display_name,visibility,leaderboard_opt_in)
values ('$USER_ID','Fantasy Score Operator','private',false);
insert into public.fantasy_games(
  id,edition_id,show_id,name,opens_at,locks_at,status,roster_size,budget,captain_multiplier,scoring_version,created_by
) values (
  '$GAME_ID','$EDITION_ID','$SHOW_ID','Fantasy Score Rehearsal',now()-interval '3 hours',now()-interval '1 hour','locked',2,50,2,'v1','$USER_ID'
);
insert into public.fantasy_game_entries(game_id,country_id,cost,eligible) values
  ('$GAME_ID','$COUNTRY_1',10,true),
  ('$GAME_ID','$COUNTRY_2',10,true);
insert into public.fantasy_teams(id,game_id,profile_id,state,captain_country_id,submitted_at,scoring_version)
values ('$TEAM_ID','$GAME_ID','$USER_ID','locked','$COUNTRY_1',now()-interval '2 hours','v1');
insert into public.fantasy_team_entries(team_id,country_id,cost_locked) values
  ('$TEAM_ID','$COUNTRY_1',10),
  ('$TEAM_ID','$COUNTRY_2',10);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','results.preview','$EDITION_ID')
on conflict do nothing;
"

log "Preview starts at Fantasy score revision zero"
[[ "$(as_user_value "select public.studio2_fantasy_score_preview('$GAME_ID'::uuid)->>'scoreRevision';")" == '0' ]] || fail "initial Fantasy score revision is not 0"

log "First canonical score advances to revision one"
[[ "$(as_user_value "select public.studio2_score_fantasy_game('$GAME_ID'::uuid,'$OPERATION_1'::uuid,'fantasy-score-1',0)->>'scoreRevision';")" == '1' ]] || fail "first Fantasy score revision is not 1"
[[ "$(db_value "select version from public.studio2_fantasy_score_versions where game_id='$GAME_ID'::uuid;")" == '1' ]] || fail "Fantasy score revision did not persist as 1"
[[ "$(db_value "select state from public.fantasy_teams where id='$TEAM_ID'::uuid;")" == 'scored' ]] || fail "Fantasy team was not scored"
[[ -n "$(db_value "select score::text from public.fantasy_teams where id='$TEAM_ID'::uuid;")" ]] || fail "Fantasy team score is null"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_1'::uuid and event_type='fantasy.scored' and aggregate_type='fantasy_score' and aggregate_version=1;")" == '1' ]] || fail "revision-one fantasy.scored event missing"

log "Exact replay returns prior result without re-scoring"
[[ "$(as_user_value "select public.studio2_score_fantasy_game('$GAME_ID'::uuid,'$OPERATION_1'::uuid,'fantasy-score-1',0)->>'scoreRevision';")" == '1' ]] || fail "exact Fantasy replay did not return revision one"
[[ "$(db_value "select version from public.studio2_fantasy_score_versions where game_id='$GAME_ID'::uuid;")" == '1' ]] || fail "exact Fantasy replay advanced score revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_1'::uuid and event_type='fantasy.scored';")" == '1' ]] || fail "exact Fantasy replay duplicated fantasy.scored"

log "Stale expected score revision rolls back"
as_user_fails "select public.studio2_score_fantasy_game('$GAME_ID'::uuid,'$OPERATION_STALE'::uuid,'fantasy-score-stale',0);" || fail "stale Fantasy score revision unexpectedly succeeded"
[[ "$(db_value "select version from public.studio2_fantasy_score_versions where game_id='$GAME_ID'::uuid;")" == '1' ]] || fail "stale Fantasy score changed revision"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_STALE'::uuid;")" == '0' ]] || fail "stale Fantasy operation claim escaped rollback"

log "Legitimate re-score advances revision one to two"
[[ "$(as_user_value "select public.studio2_score_fantasy_game('$GAME_ID'::uuid,'$OPERATION_2'::uuid,'fantasy-score-2',1)->>'scoreRevision';")" == '2' ]] || fail "second Fantasy score revision is not 2"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='fantasy_score' and aggregate_id='$GAME_ID' and event_type='fantasy.scored';")" == '2' ]] || fail "Fantasy score event history does not contain exactly two revisions"

log "Legacy scorer and score revision state are not browser-accessible"
as_user_fails "select public.score_fantasy_game('$GAME_ID'::uuid);" || fail "legacy Fantasy scorer remains browser callable"
[[ "$(db_value "select has_table_privilege('authenticated','public.studio2_fantasy_score_versions','SELECT');")" == 'f' ]] || fail "authenticated can read Fantasy score revision table"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='fantasy_score' and (payload ? 'profileId' or payload ? 'userId' or payload ? 'teamEntries');")" == '0' ]] || fail "Fantasy score event leaked private team identity"

log "System V3 S5 Fantasy score consequence rehearsal passed"
