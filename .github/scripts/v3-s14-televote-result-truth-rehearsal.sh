#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-televote-result-truth] %s\n' "$*"; }
fail() { printf '\n[v3-s14-televote-result-truth] FAIL: %s\n' "$*" >&2; exit 1; }

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

EDITION_ID='00000000-0000-4000-8000-00000000b101'
SHOW_ID='00000000-0000-4000-8000-00000000b102'
COUNTRY_A='00000000-0000-4000-8000-00000000b111'
COUNTRY_B='00000000-0000-4000-8000-00000000b112'
COUNTRY_C='00000000-0000-4000-8000-00000000b113'
PARTICIPANT_A='00000000-0000-4000-8000-00000000b121'
PARTICIPANT_B='00000000-0000-4000-8000-00000000b122'
PARTICIPANT_C='00000000-0000-4000-8000-00000000b123'
TV_EDITION='00000000-0000-4000-8000-00000000b130'
ROUND_ID='00000000-0000-4000-8000-00000000b131'
AGGREGATION_ID='00000000-0000-4000-8000-00000000b132'
AGGREGATION_SOURCE='00000000-0000-4000-8000-00000000b133'
MISMATCH_ROUND='00000000-0000-4000-8000-00000000b134'
UNBOUND_ROUND='00000000-0000-4000-8000-00000000b135'
USER_ID='00000000-0000-4000-8000-00000000b140'

log "Seeding one exact three-entry Solaris show and Televoting round"
db_exec "
insert into public.countries(id,name,short_code,region) values
  ('$COUNTRY_A','S14 Truth A','TTA','S14 truth'),
  ('$COUNTRY_B','S14 Truth B','TTB','S14 truth'),
  ('$COUNTRY_C','S14 Truth C','TTC','S14 truth')
on conflict (id) do update set name=excluded.name,short_code=excluded.short_code,region=excluded.region;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Televote Truth','s14-televote-truth',1410,2026,'active',false)
on conflict (id) do update set name=excluded.name,status='active',published=false;

insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config,publication_config)
values ('$SHOW_ID','$EDITION_ID','S14 Televote Truth Final','grand-final',1,false,
  '{\"juryEnabled\":false,\"televoteEnabled\":true,\"tieBreak\":[\"televote\",\"runningOrder\"]}'::jsonb,
  '{}'::jsonb)
on conflict (id) do update set voting_config=excluded.voting_config,published=false;

insert into public.participants(id,edition_id,show_id,country_id,artist,song,running_order,participation_status) values
  ('$PARTICIPANT_A','$EDITION_ID','$SHOW_ID','$COUNTRY_A','Artist A','Song A',1,'confirmed'),
  ('$PARTICIPANT_B','$EDITION_ID','$SHOW_ID','$COUNTRY_B','Artist B','Song B',2,'confirmed'),
  ('$PARTICIPANT_C','$EDITION_ID','$SHOW_ID','$COUNTRY_C','Artist C','Song C',3,'confirmed')
on conflict (id) do update set show_id=excluded.show_id,country_id=excluded.country_id,participation_status='confirmed';

insert into televoting.editions(id,name,is_active,is_archived)
values ('$TV_EDITION','S14 Televote Truth',true,false)
on conflict (id) do update set is_active=true,is_archived=false;

insert into televoting.countries(code,name,flag) values
  ('TTA','S14 Truth A','A'),('TTB','S14 Truth B','B'),('TTC','S14 Truth C','C')
on conflict (code) do update set name=excluded.name;

insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode,
  results_status,calculation_version,calculated_at,results_outdated,broadcast_display_mode
) values (
  '$ROUND_ID','$TV_EDITION','S14 published round','closed',24,'countries','country_match',
  'calculated',1,'2026-10-16T19:00:00Z',false,'converted'
)
on conflict (id) do update set
  results_status='calculated',calculation_version=1,calculated_at='2026-10-16T19:00:00Z',
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
  ('$ROUND_ID','TTA',30,3,1,3,3,1.33,1,1,12,12,0,0,12,24,1,'2026-10-16T19:00:00Z'),
  ('$ROUND_ID','TTB',20,3,2,3,3,1.33,1,1,8,8,0,0,8,24,1,'2026-10-16T19:00:00Z'),
  ('$ROUND_ID','TTC',10,3,3,3,3,1.33,1,1,4,4,0,0,4,24,1,'2026-10-16T19:00:00Z');
"

log "Publishing the exact bound round materializes Studio Televote truth"
db_exec "update televoting.rounds set results_status='published' where id='$ROUND_ID'::uuid;"
[[ "$(db_scalar "select count(*) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3" ]] || fail "published round did not materialize three canonical Televote rows"
[[ "$(db_scalar "select sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "24" ]] || fail "published round points do not match source"
[[ "$(db_scalar "select source_type || ':' || source_id || ':' || source_version from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "round:$ROUND_ID:1" ]] || fail "round source/version provenance missing"
[[ "$(db_scalar "select (private.studio2_result_preconditions('$SHOW_ID'::uuid)->>'televoteReady')::boolean;")" == "t" ]] || fail "Studio readiness did not accept published Televote projection"
[[ "$(db_scalar "select sum(televote_points) from public.results where show_id='$SHOW_ID'::uuid;")" == "24" ]] || fail "derived Studio result projection disagrees with published Televote"
log "PASS: published round satisfies Studio result truth"

log "Exact replay is idempotent and recalculation consumes the same projection"
db_exec "select private.v3_sync_published_televote_round('$ROUND_ID'::uuid); select public.sync_show_results_from_votes('$SHOW_ID'::uuid);"
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "1" ]] || fail "exact replay created a fake projection revision"
[[ "$(db_scalar "select sum(televote_points) from public.results where show_id='$SHOW_ID'::uuid;")" == "24" ]] || fail "recalculation changed the published Televote truth"

ROWS_V1="[{\"country_id\":\"$COUNTRY_A\",\"points\":12},{\"country_id\":\"$COUNTRY_B\",\"points\":8},{\"country_id\":\"$COUNTRY_C\",\"points\":4}]"
ROWS_CHANGED="[{\"country_id\":\"$COUNTRY_A\",\"points\":11},{\"country_id\":\"$COUNTRY_B\",\"points\":9},{\"country_id\":\"$COUNTRY_C\",\"points\":4}]"
db_expect_failure "same source version with changed semantics" "select private.v3_apply_published_televote_projection('$EDITION_ID','$SHOW_ID','round','$ROUND_ID',1,'2026-10-16T19:00:00Z','$ROWS_CHANGED'::jsonb);"

log "A newer calculation version supersedes without double-counting"
db_exec "
update televoting.round_results
set calculation_version=2,
    final_points=case country_code when 'TTA' then 10 when 'TTB' then 9 else 5 end,
    calculated_at='2026-10-16T19:10:00Z'
where round_id='$ROUND_ID'::uuid;
update televoting.rounds
set calculation_version=2,calculated_at='2026-10-16T19:10:00Z'
where id='$ROUND_ID'::uuid;
"
[[ "$(db_scalar "select source_version || ':' || projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "2:2" ]] || fail "new round version did not supersede once"
[[ "$(db_scalar "select count(*) || ':' || sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3:24" ]] || fail "new round version duplicated or lost Televote rows"
db_expect_failure "older source version after supersession" "select private.v3_apply_published_televote_projection('$EDITION_ID','$SHOW_ID','round','$ROUND_ID',1,'2026-10-16T19:00:00Z','$ROWS_V1'::jsonb);"

log "A newer published Combined Televote supersedes the single-round source"
db_exec "
update televoting.rounds set broadcast_display_mode='combined' where id='$ROUND_ID'::uuid;
insert into televoting.televote_aggregations(
  id,edition_id,name,status,calculation_version,calculated_at,published_at,results_outdated
) values (
  '$AGGREGATION_ID','$TV_EDITION','S14 Combined Truth','draft',1,
  '2026-10-16T19:20:00Z','2026-10-16T19:20:00Z',false
)
on conflict (id) do update set status='draft',calculation_version=1,calculated_at='2026-10-16T19:20:00Z',published_at='2026-10-16T19:20:00Z',results_outdated=false;
insert into televoting.televote_aggregation_sources(
  id,aggregation_id,source_type,source_round_id,source_name,enabled,display_order
) values ('$AGGREGATION_SOURCE','$AGGREGATION_ID','round','$ROUND_ID','S14 published round',true,0)
on conflict (id) do update set enabled=true,source_round_id=excluded.source_round_id;
delete from televoting.combined_televote_results where aggregation_id='$AGGREGATION_ID'::uuid;
insert into televoting.combined_televote_results(
  aggregation_id,country_code,calculation_version,final_combined_points,final_rank
) values
  ('$AGGREGATION_ID','TTA',1,15,1),
  ('$AGGREGATION_ID','TTB',1,10,2),
  ('$AGGREGATION_ID','TTC',1,5,3);
-- Source edits correctly mark an already-calculated aggregation outdated. Real
-- Organizer publication can only follow recalculation, which clears that flag.
-- This manual seed represents the post-recalculation state before publishing.
update televoting.televote_aggregations
set results_outdated=false,status='published'
where id='$AGGREGATION_ID'::uuid;
"
[[ "$(db_scalar "select source_type || ':' || source_id || ':' || source_version || ':' || projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "combined:$AGGREGATION_ID:1:3" ]] || fail "Combined source did not supersede round provenance"
[[ "$(db_scalar "select count(*) || ':' || sum(points) from public.televote_votes where show_id='$SHOW_ID'::uuid;")" == "3:30" ]] || fail "Combined projection did not replace the round rows exactly"
[[ "$(db_scalar "select sum(televote_points) from public.results where show_id='$SHOW_ID'::uuid;")" == "30" ]] || fail "Studio results do not consume the Combined projection"

log "A source round that belongs to Combined mode cannot overwrite the Combined truth"
db_exec "
update televoting.round_results
set calculation_version=3,final_points=1,calculated_at='2026-10-16T19:30:00Z'
where round_id='$ROUND_ID'::uuid;
update televoting.rounds set calculation_version=3,calculated_at='2026-10-16T19:30:00Z' where id='$ROUND_ID'::uuid;
"
[[ "$(db_scalar "select source_type || ':' || source_id || ':' || projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "combined:$AGGREGATION_ID:3" ]] || fail "Combined truth was overwritten by a component round"

log "Bound lineup mismatch is fail-closed"
db_exec "
insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode,
  results_status,calculation_version,calculated_at,results_outdated,broadcast_display_mode
) values ('$MISMATCH_ROUND','$TV_EDITION','S14 mismatch','closed',10,'countries','country_match','calculated',1,'2026-10-16T19:40:00Z',false,'converted');
insert into public.televoting_round_bindings(remote_round_id,remote_edition_id,edition_id,show_id,source_mode)
values ('$MISMATCH_ROUND','$TV_EDITION','$EDITION_ID','$SHOW_ID','show');
insert into televoting.round_results(
  round_id,country_code,original_votes,original_voters,original_rank,participant_count,
  rank_base,rank_exponent,rank_factor,weighted_score,exact_points,floored_points,
  decimal_remainder,remainder_bonus,final_points,total_points_to_distribute,calculation_version
) values
  ('$MISMATCH_ROUND','TTA',1,1,1,2,2,1.33,1,1,6,6,0,0,6,10,1),
  ('$MISMATCH_ROUND','TTB',1,1,2,2,2,1.33,1,1,4,4,0,0,4,10,1);
"
db_expect_failure "bound published round with incomplete lineup" "update televoting.rounds set results_status='published' where id='$MISMATCH_ROUND'::uuid;"
[[ "$(db_scalar "select source_id from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "$AGGREGATION_ID" ]] || fail "mismatched source altered canonical provenance"

log "Unbound publication never fabricates a Solaris projection"
db_exec "
insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode,
  results_status,calculation_version,calculated_at,results_outdated,broadcast_display_mode
) values ('$UNBOUND_ROUND','$TV_EDITION','S14 unbound','closed',24,'countries','country_match','calculated',1,'2026-10-16T19:50:00Z',false,'converted');
insert into televoting.round_results(
  round_id,country_code,original_votes,original_voters,original_rank,participant_count,
  rank_base,rank_exponent,rank_factor,weighted_score,exact_points,floored_points,
  decimal_remainder,remainder_bonus,final_points,total_points_to_distribute,calculation_version
) values
  ('$UNBOUND_ROUND','TTA',1,1,1,3,3,1.33,1,1,12,12,0,0,12,24,1),
  ('$UNBOUND_ROUND','TTB',1,1,2,3,3,1.33,1,1,8,8,0,0,8,24,1),
  ('$UNBOUND_ROUND','TTC',1,1,3,3,3,1.33,1,1,4,4,0,0,4,24,1);
update televoting.rounds set results_status='published' where id='$UNBOUND_ROUND'::uuid;
"
[[ "$(db_scalar "select source_id from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "$AGGREGATION_ID" ]] || fail "unbound source altered canonical provenance"

log "Browser writes cannot mutate a source-managed Televote projection"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s14-tv-truth@local.invalid',now(),now())
on conflict (id) do nothing;
insert into public.user_roles(user_id,role) values ('$USER_ID','organizer') on conflict do nothing;
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','televote.ballots.manage','$EDITION_ID'),('$USER_ID','televote.ballots.read','$EDITION_ID')
on conflict do nothing;
"
db_expect_failure "authenticated direct edit of published Televote projection" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; update public.televote_votes set points=999 where show_id='$SHOW_ID'::uuid and country_id='$COUNTRY_A'::uuid;"

STATUS="$(db_scalar "set request.jwt.claim.role='service_role'; select public.studio2_televote_projection_status('$SHOW_ID'::uuid)::text;")"
python3 - "$STATUS" "$AGGREGATION_ID" <<'PY'
import json,sys
status=json.loads(sys.argv[1])
assert status['managed'] is True
assert status['sourceType'] == 'combined'
assert status['sourceId'] == sys.argv[2]
assert status['sourceVersion'] == 1
assert status['projectionRevision'] == 3
assert status['rowCount'] == 3
assert status['pointsTotal'] == 30
assert status['televoteVoteRows'] == 3
PY
log "PASS: safe provenance status reconciles to the canonical projection"

log "All S14 published Televote result truth checks passed"
