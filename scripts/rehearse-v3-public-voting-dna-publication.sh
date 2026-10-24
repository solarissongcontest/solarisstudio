#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-public-voting-dna] %s\n' "$*"; }
fail() { printf '\n[v3-public-voting-dna] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac

case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

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

COUNTRY_ID='00000000-0000-4000-8000-00000000da27'
EDITION_ID='00000000-0000-4000-8000-00000000ed27'
SHOW_ID='00000000-0000-4000-8000-00000000ab27'
RESULT_ID='00000000-0000-4000-8000-00000000bc27'

cleanup() {
  db_exec "delete from public.results where id='$RESULT_ID';" || true
  db_exec "delete from public.shows where id='$SHOW_ID';" || true
  db_exec "delete from public.editions where id='$EDITION_ID';" || true
  db_exec "delete from public.countries where id='$COUNTRY_ID';" || true
}
trap cleanup EXIT

cleanup

log "Seeding one published Result with split layers initially hidden"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','Voting DNA Boundary Country','V27');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','Voting DNA Boundary Edition',2026,'voting-dna-boundary-edition',9927,'active',true);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config) values ('$SHOW_ID','$EDITION_ID','Voting DNA Boundary Final','grand-final',1,true,jsonb_build_object('results',true,'jury_results',false,'televote_results',false,'detailed_voting',false));"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',120,80,200,1);"

[[ "$(db_value "select prosecdef::text from pg_proc where oid='public.v3_public_country_voting_dna(uuid)'::regprocedure;")" == 't' ]] || fail "Voting DNA projection must remain SECURITY DEFINER"
[[ "$(db_value "select coalesce(array_to_string(proconfig, ','),'') from pg_proc where oid='public.v3_public_country_voting_dna(uuid)'::regprocedure;")" == 'search_path=""' ]] || fail "Voting DNA projection search_path is not fixed to empty"

for role in anon authenticated; do
  log "Checking ${role}: generic Results public, split layers hidden"
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} can bypass the projection through raw public.results while split layers are hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'sample'->>'resultEditions'")" == '1' ]] || fail "${role} did not receive the generic published Result"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'totalPoints'")" == '200' ]] || fail "${role} generic Result total is incorrect"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPublished'")" == 'false' ]] || fail "${role} Jury publication flag leaked"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints' is null")" == 't' ]] || fail "${role} Jury points leaked while hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'false' ]] || fail "${role} Televote publication flag leaked"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints' is null")" == 't' ]] || fail "${role} Televote points leaked while hidden"
done

log "Publishing Jury only must expose Jury through the bounded projection without exposing the raw Result row"
db_exec "update public.shows set publication_config=jsonb_build_object('results',true,'jury_results',true,'televote_results',false,'detailed_voting',false) where id='$SHOW_ID';"
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} can read the raw Result row while Televote remains hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPublished'")" == 'true' ]] || fail "${role} did not observe Jury publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints'")" == '120' ]] || fail "${role} published Jury points are incorrect"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'false' ]] || fail "${role} Televote became public with Jury"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints' is null")" == 't' ]] || fail "${role} hidden Televote points crossed the API boundary"
done

log "Publishing Televote too must expose both split layers and make the legacy raw row safe to read"
db_exec "update public.shows set publication_config=jsonb_build_object('results',true,'jury_results',true,'televote_results',true,'detailed_voting',false) where id='$SHOW_ID';"
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '1' ]] || fail "${role} did not regain raw Result compatibility after every Result layer became public"
  [[ "$(role_value "$role" "jury_points::text || ':' || televote_points::text from public.results where id='$RESULT_ID'")" == '120:80' ]] || fail "${role} raw Result values are incorrect after every split layer is public"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'juryPoints'")" == '120' ]] || fail "${role} Jury points regressed after Televote publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePublished'")" == 'true' ]] || fail "${role} did not observe Televote publication"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'results'->0->>'televotePoints'")" == '80' ]] || fail "${role} published Televote points are incorrect"
done

log "Hiding generic Results must remove both bounded and raw Result evidence even if split flags remain true"
db_exec "update public.shows set publication_config=jsonb_build_object('results',false,'jury_results',true,'televote_results',true,'detailed_voting',false) where id='$SHOW_ID';"
for role in anon authenticated; do
  [[ "$(role_value "$role" "count(*) from public.results where id='$RESULT_ID'")" == '0' ]] || fail "${role} retained raw Result access after generic Results were hidden"
  [[ "$(role_value "$role" "public.v3_public_country_voting_dna('$COUNTRY_ID')->'sample'->>'resultEditions'")" == '0' ]] || fail "${role} retained Result evidence after generic Results were hidden"
  [[ "$(role_value "$role" "jsonb_array_length(public.v3_public_country_voting_dna('$COUNTRY_ID')->'results')")" == '0' ]] || fail "${role} retained Result rows after generic Results were hidden"
done

log "System V3 Public Voting DNA publication-boundary rehearsal passed"
