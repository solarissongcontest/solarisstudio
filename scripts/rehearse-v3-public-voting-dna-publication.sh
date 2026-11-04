#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-public-voting-dna] %s\n' "$*"; }
fail() { printf '\n[v3-public-voting-dna] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

# Exact authority/path matching is mandatory. A wildcard here can allow
# deceptive userinfo, query-string host= overrides, or non-loopback routing.
local_api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'
local_db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
[[ "$API_URL" =~ $local_api_pattern ]] || fail "Refusing hosted Supabase rehearsal"
[[ "$DB_URL" =~ $local_db_pattern ]] || fail "Refusing non-local database rehearsal"

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
role_value() {
  local role="$1"
  local expression="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
begin;
set local role ${role};
select ${expression};
rollback;
SQL
}

# Mirror the existing public result snapshot rehearsal: outcome layers can
# be exposed only after the exact result version is captured and reveal ready.
publish_layers() {
  local config="$1"
  db_exec "begin;
    update public.shows
    set publication_config=private.studio2_normalise_publication_config('$config'::jsonb),
        published=true,updated_at=now()
    where id='$SHOW_ID';
    update public.studio2_show_publication_controls
    set state='public',version=version+1,
        frozen_config=private.studio2_normalise_publication_config('$config'::jsonb),
        source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
        source_result_version=case
          when private.studio2_publication_has_outcomes(
            private.studio2_normalise_publication_config('$config'::jsonb)
          ) then 1::bigint
          else null::bigint
        end,
        scheduled_for=null,scheduled_from_state=null,scheduled_by=null,scheduled_operation_id=null,
        last_failure=null,last_failure_at=null,updated_at=now()
    where show_id='$SHOW_ID';
  commit;"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000da27'
EDITION_ID='00000000-0000-4000-8000-00000000ed27'
SHOW_ID='00000000-0000-4000-8000-00000000ab27'
RESULT_ID='00000000-0000-4000-8000-00000000bc27'

# This rehearsal runs only in a disposable locally reset Supabase instance.
# Its captured result versions are immutable historical evidence: never disable
# integrity guards or delete them merely for fixture teardown. Local Docker
# resources are disposed by the workflow; running twice requires a fresh reset.
[[ "$(db_value "select count(*) from public.countries where id='$COUNTRY_ID';")" == '0' ]] ||
  fail "Fixture identities already exist: reset the isolated local database before rehearing"

log "Seeding one published Result with split layers initially hidden"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','Voting DNA Boundary Country','V27');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','Voting DNA Boundary Edition',2026,'voting-dna-boundary-edition',9927,'active',true);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config) values ('$SHOW_ID','$EDITION_ID','Voting DNA Boundary Final','grand-final',1,false,'{}'::jsonb);"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',120,80,200,1);"
db_exec "insert into public.studio2_result_operations(show_id,edition_id,calculation_version,last_calculated_at,reviewed_version,reviewed_at,locked_version,locked_at,reveal_ready_version,reveal_ready_at) values ('$SHOW_ID','$EDITION_ID',1,now(),1,now(),1,now(),1,now());"
[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '1' ]] || fail "Immutable result version not captured before publication"
publish_layers '{"results":true,"jury_results":false,"televote_results":false,"detailed_voting":false}'

[[ "$(db_value "select prosecdef::text from pg_proc where oid='public.v3_public_country_voting_dna(uuid)'::regprocedure;")" == 'true' ]] || fail "Voting DNA projection must remain SECURITY DEFINER"
[[ "$(db_value "select prosecdef::text from pg_proc where oid='public.public_country_voting_dna(uuid)'::regprocedure;")" == 'false' ]] || fail "Legacy Voting DNA must stay SECURITY INVOKER so raw Results RLS cannot be bypassed"
[[ "$(db_value "select coalesce(array_to_string(proconfig, ','),'') from pg_proc where oid='public.v3_public_country_voting_dna(uuid)'::regprocedure;")" == 'search_path=""' ]] || fail "Voting DNA projection search_path is not fixed to empty"

for role in anon authenticated; do
  log "Checking ${role}: generic Results public, split layers hidden"
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} can bypass the projection through raw public.results while split layers are hidden"
  [[ "$(role_value "$role" "jsonb_array_length(public.public_country_voting_dna('$COUNTRY_ID')->'results')")" == '0' ]] || fail "${role} legacy Voting DNA leaks split result scores before independent publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'sample'->>'resultEditions'")" == '1' ]] || fail "${role} did not receive the generic published Result"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'totalPoints'")" == '200' ]] || fail "${role} generic Result total is incorrect"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPublished'")" == 'false' ]] || fail "${role} Jury publication flag leaked"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints' is null")" == 't' ]] || fail "${role} Jury points leaked while hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'false' ]] || fail "${role} Televote publication flag leaked"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints' is null")" == 't' ]] || fail "${role} Televote points leaked while hidden"
done

log "Publishing Jury only must expose Jury through the bounded projection without exposing the raw Result row"
publish_layers '{"results":true,"jury_results":true,"televote_results":false,"detailed_voting":false}'
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} can read the raw Result row while Televote remains hidden"
  [[ "$(role_value "$role" "jsonb_array_length(public.public_country_voting_dna('$COUNTRY_ID')->'results')")" == '0' ]] || fail "${role} legacy Voting DNA leaks Televote points during Jury-only publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPublished'")" == 'true' ]] || fail "${role} did not observe Jury publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints'")" == '120' ]] || fail "${role} published Jury points are incorrect"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'false' ]] || fail "${role} Televote became public with Jury"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints' is null")" == 't' ]] || fail "${role} hidden Televote points crossed the API boundary"
done

log "Publishing Televote too must expose both split layers and make the legacy raw row safe to read"
publish_layers '{"results":true,"jury_results":true,"televote_results":true,"detailed_voting":false}'
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '1' ]] || fail "${role} did not regain raw Result compatibility after every Result layer became public"
  [[ "$(role_value "$role" "jury_points::text || ':' || televote_points::text from public.results where id='$RESULT_ID'")" == '120:80' ]] || fail "${role} raw Result values are incorrect after every split layer is public"
  [[ "$(role_value "$role" "public.public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints'")" == '120' ]] || fail "${role} legacy Jury compatibility did not return after full publication"
  [[ "$(role_value "$role" "public.public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints'")" == '80' ]] || fail "${role} legacy Televote compatibility did not return after full publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints'")" == '120' ]] || fail "${role} Jury points regressed after Televote publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'true' ]] || fail "${role} did not observe Televote publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints'")" == '80' ]] || fail "${role} published Televote points are incorrect"
done

log "Canonical normalization forces generic Results public when a split outcome is published"
[[ "$(db_value "select private.studio2_normalise_publication_config('{\"results\":false,\"jury_results\":true,\"televote_results\":true}'::jsonb)->>'results';")" == 'true' ]] || fail "Split publication must require generic Results"

log "Withdrawing all outcome layers must remove both bounded and raw Result evidence"
publish_layers '{"results":false,"jury_results":false,"televote_results":false,"detailed_voting":false}'
[[ "$(db_value "select publication_config->>'results' from public.shows where id='$SHOW_ID';")" == 'false' ]] || fail "Generic Results remained exposed after withdrawing all split layers"
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} retained raw Result access after generic Results were hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'sample'->>'resultEditions'")" == '0' ]] || fail "${role} retained Result evidence after generic Results were hidden"
  [[ "$(role_value "$role" "jsonb_array_length(public.v3_public_country_voting_dna('$COUNTRY_ID')->'results')")" == '0' ]] || fail "${role} retained Result rows after generic Results were hidden"
  [[ "$(role_value "$role" "jsonb_array_length(public.public_country_voting_dna('$COUNTRY_ID')->'results')")" == '0' ]] || fail "${role} legacy Voting DNA retained Result rows after generic Results were hidden"
done

log "Rehearsing raw Jury anonymity and show-less history in a rolled-back local transaction"
jury_visibility="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<SQL
begin;
insert into public.countries(id,name,short_code)
values ('00000000-0000-4000-8000-00000000da28','Voting DNA Jury Voter','V28');
insert into public.contest_entities(edition_id,entity_type,country_id,display_name,abbreviation)
values
  ('$EDITION_ID','global','$COUNTRY_ID','Voting DNA Boundary Country','V27'),
  ('$EDITION_ID','global','00000000-0000-4000-8000-00000000da28','Voting DNA Jury Voter','V28');
insert into public.jury_votes(id,edition_id,show_id,voter_country_id,receiving_country_id,points)
values
  ('00000000-0000-4000-8000-00000000bb27','$EDITION_ID',null,'00000000-0000-4000-8000-00000000da28','$COUNTRY_ID',1),
  ('00000000-0000-4000-8000-00000000bb28','$EDITION_ID','$SHOW_ID','00000000-0000-4000-8000-00000000da28','$COUNTRY_ID',2);
set local role anon;
select 'anon_private=' || count(*) from public.jury_votes
where id in ('00000000-0000-4000-8000-00000000bb27','00000000-0000-4000-8000-00000000bb28');
set local role authenticated;
select 'auth_private=' || count(*) from public.jury_votes
where id in ('00000000-0000-4000-8000-00000000bb27','00000000-0000-4000-8000-00000000bb28');
set local role postgres;
update public.shows
set publication_config = private.studio2_normalise_publication_config(
    jsonb_set(publication_config, '{detailed_voting}', 'true'::jsonb)),
    updated_at=now()
where id='$SHOW_ID';
update public.studio2_show_publication_controls
set version=version+1,
    frozen_config=(select publication_config from public.shows where id='$SHOW_ID'),
    source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
    source_result_version=1,updated_at=now()
where show_id='$SHOW_ID';
set local role anon;
select 'anon_published=' || count(*) from public.jury_votes
where id = '00000000-0000-4000-8000-00000000bb28';
select 'anon_showless=' || count(*) from public.jury_votes
where id = '00000000-0000-4000-8000-00000000bb27';
set local role authenticated;
select 'auth_published=' || count(*) from public.jury_votes
where id = '00000000-0000-4000-8000-00000000bb28';
select 'auth_showless=' || count(*) from public.jury_votes
where id = '00000000-0000-4000-8000-00000000bb27';
rollback;
SQL
)"
expected_jury_visibility="$(printf '%s\n' 'anon_private=0' 'auth_private=0' 'anon_published=1' 'anon_showless=0' 'auth_published=1' 'auth_showless=0')"
[[ "$jury_visibility" == "$expected_jury_visibility" ]] ||
  fail "Raw Jury publication role matrix diverged from expected privacy/show boundary"

log "Rehearsing raw Televote and voter publication with disposable local records"
voting_visibility="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<SQL
begin;
insert into public.voters(id,edition_id,show_id,country_id,name,kind)
values
 ('00000000-0000-4000-8000-00000000aa27','$EDITION_ID',null,'$COUNTRY_ID','Legacy show-less voter','country'),
 ('00000000-0000-4000-8000-00000000aa28','$EDITION_ID','$SHOW_ID','$COUNTRY_ID','Show voter','country');
insert into public.televote_votes(id,edition_id,show_id,country_id,points)
values
 ('00000000-0000-4000-8000-00000000aa29','$EDITION_ID',null,'$COUNTRY_ID',3),
 ('00000000-0000-4000-8000-00000000aa30','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',4);
set local role anon;
select 'anon_tv_private=' || count(*) from public.televote_votes
where id in ('00000000-0000-4000-8000-00000000aa29','00000000-0000-4000-8000-00000000aa30');
select 'anon_voter_private=' || count(*) from public.voters
where id in ('00000000-0000-4000-8000-00000000aa27','00000000-0000-4000-8000-00000000aa28');
set local role authenticated;
select 'auth_tv_private=' || count(*) from public.televote_votes
where id in ('00000000-0000-4000-8000-00000000aa29','00000000-0000-4000-8000-00000000aa30');
select 'auth_voter_private=' || count(*) from public.voters
where id in ('00000000-0000-4000-8000-00000000aa27','00000000-0000-4000-8000-00000000aa28');
set local role postgres;
update public.shows
set publication_config = private.studio2_normalise_publication_config(
    jsonb_set(coalesce(publication_config,'{}'::jsonb), '{detailed_voting}', 'true'::jsonb)),
    updated_at=now()
where id='$SHOW_ID';
update public.studio2_show_publication_controls
set version=version+1,
    frozen_config=(select publication_config from public.shows where id='$SHOW_ID'),
    source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
    source_result_version=1,updated_at=now()
where show_id='$SHOW_ID';
set local role anon;
select 'anon_tv_published=' || count(*) from public.televote_votes
where id = '00000000-0000-4000-8000-00000000aa30';
select 'anon_tv_showless=' || count(*) from public.televote_votes
where id = '00000000-0000-4000-8000-00000000aa29';
select 'anon_voter_published=' || count(*) from public.voters
where id = '00000000-0000-4000-8000-00000000aa28';
select 'anon_voter_showless=' || count(*) from public.voters
where id = '00000000-0000-4000-8000-00000000aa27';
set local role authenticated;
select 'auth_tv_published=' || count(*) from public.televote_votes
where id = '00000000-0000-4000-8000-00000000aa30';
select 'auth_tv_showless=' || count(*) from public.televote_votes
where id = '00000000-0000-4000-8000-00000000aa29';
select 'auth_voter_published=' || count(*) from public.voters
where id = '00000000-0000-4000-8000-00000000aa28';
select 'auth_voter_showless=' || count(*) from public.voters
where id = '00000000-0000-4000-8000-00000000aa27';
rollback;
SQL
)"
expected_voting_visibility="$(printf '%s\n' \
  'anon_tv_private=0' 'anon_voter_private=0' \
  'auth_tv_private=0' 'auth_voter_private=0' \
  'anon_tv_published=1' 'anon_tv_showless=0' \
  'anon_voter_published=1' 'anon_voter_showless=0' \
  'auth_tv_published=1' 'auth_tv_showless=0' \
  'auth_voter_published=1' 'auth_voter_showless=0')"
[[ "$voting_visibility" == "$expected_voting_visibility" ]] ||
  fail "Raw Televote/voter role matrix exposed unpublished or show-less records"

log "System V3 Public Voting DNA publication-boundary rehearsal passed"
