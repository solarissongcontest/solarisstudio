#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-public-result-snapshot] %s\n' "$*"; }
fail() { printf '\n[v3-public-result-snapshot] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
# Prefix checks can match deceptive URLs such as localhost:5432@evil.example.
# Parse effective URL authority and forbid libpq query/environment overrides before
# any database command can execute. Browser/API and PostgreSQL stay loopback-only.
if ! API_URL="$API_URL" DB_URL="$DB_URL" node --input-type=module <<'NODE'
const deny = (message) => { console.error("[v3-public-result-snapshot] " + message); process.exit(1); };
const hostAllowed = (value) => value === "127.0.0.1" || value === "localhost";
const url = (value, label) => {
  try { return new URL(value); } catch { deny(label + ": invalid connection URL"); }
};
const portAllowed = (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
const api = url(process.env.API_URL, "API_URL");
if (api.protocol !== "http:" || !hostAllowed(api.hostname) || !portAllowed(api.port) ||
    api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
  deny("Refusing hosted/non-loopback Supabase API URL");
}
const db = url(process.env.DB_URL, "DB_URL");
if (!["postgres:", "postgresql:"].includes(db.protocol) || !hostAllowed(db.hostname) ||
    !portAllowed(db.port) || db.username !== "postgres" || db.password !== "postgres" ||
    db.pathname !== "/postgres" || db.search || db.hash) {
  deny("Refusing hosted/non-loopback database URL or connection override");
}
for (const envName of ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) {
  if (process.env[envName]) deny("Refusing libpq connection override: " + envName);
}
NODE
then
  fail "Unsafe Supabase rehearsal configuration"
fi

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
anon_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
begin;
set local role anon;
select $1;
rollback;
SQL
}

COUNTRY_ID='00000000-0000-4000-8000-00000000ca52'
EDITION_ID='00000000-0000-4000-8000-00000000ed52'
SHOW_ID='00000000-0000-4000-8000-00000000ab52'
RESULT_ID='00000000-0000-4000-8000-00000000bc52'

log "Seeding an exact result version while the show is private"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','Public Snapshot Country','P52');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','Public Snapshot Edition',2026,'public-snapshot-edition',9952,'active',true);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config) values ('$SHOW_ID','$EDITION_ID','Public Snapshot Final','final',1,false,'{}'::jsonb);"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',12,10,22,1);"
db_exec "insert into public.studio2_result_operations(show_id,edition_id,calculation_version,last_calculated_at,reviewed_version,reviewed_at,locked_version,locked_at,reveal_ready_version,reveal_ready_at) values ('$SHOW_ID','$EDITION_ID',1,now(),1,now(),1,now(),1,now());"

[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '1' ]] || fail "immutable result version 1 was not captured"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID') is null")" == 't' ]] || fail "private show exposed a result snapshot"

log "Publishing version 1 with only overall results public"
db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),published=true,updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public',version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=1,
      scheduled_for=null,scheduled_from_state=null,scheduled_by=null,scheduled_operation_id=null,
      last_failure=null,last_failure_at=null,updated_at=now()
  where show_id='$SHOW_ID';
commit;"

[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->>'resultVersion'")" == '1' ]] || fail "anon projection did not expose published version 1"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->>'publicationState'")" == 'public' ]] || fail "publication state was not public"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'availability'->>'jury'")" == 'false' ]] || fail "jury availability leaked before publication"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'availability'->>'televote'")" == 'false' ]] || fail "televote availability leaked before publication"
[[ "$(anon_value "(public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0) ? 'juryPoints'")" == 'f' ]] || fail "jury points leaked before jury publication"
[[ "$(anon_value "(public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0) ? 'televotePoints'")" == 'f' ]] || fail "televote points leaked before televote publication"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0->>'totalPoints'")" == '22' ]] || fail "published total was incorrect"

log "Mutating live result rows cannot rewrite the published immutable snapshot"
db_exec "update public.results set jury_points=55,televote_points=944,total_points=999 where id='$RESULT_ID';"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0->>'totalPoints'")" == '22' ]] || fail "mutable result row changed published version 1"

log "Hiding the publication removes the public projection"
db_exec "begin;
  update public.shows set published=false,updated_at=now() where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='hidden',version=version+1,source_result_version=null,
      scheduled_for=null,scheduled_from_state=null,scheduled_by=null,scheduled_operation_id=null,
      last_failure=null,last_failure_at=null,updated_at=now()
  where show_id='$SHOW_ID';
commit;"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID') is null")" == 't' ]] || fail "hidden publication still exposed a snapshot"

log "Capturing and publishing corrected version 2"
db_exec "update public.studio2_result_operations
set calculation_version=2,last_calculated_at=now(),
    reviewed_version=2,reviewed_at=now(),
    locked_version=2,locked_at=now(),
    reveal_ready_version=2,reveal_ready_at=now()
where show_id='$SHOW_ID';"
[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=2;")" == '1' ]] || fail "immutable corrected result version 2 was not captured"

db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true,\"jury_results\":true}'::jsonb),published=true,updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public',version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true,\"jury_results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=2,
      scheduled_for=null,scheduled_from_state=null,scheduled_by=null,scheduled_operation_id=null,
      last_failure=null,last_failure_at=null,updated_at=now()
  where show_id='$SHOW_ID';
commit;"

[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->>'resultVersion'")" == '2' ]] || fail "published correction did not switch to version 2"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0->>'totalPoints'")" == '999' ]] || fail "corrected total did not come from version 2"
[[ "$(anon_value "public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0->>'juryPoints'")" == '55' ]] || fail "published jury split did not come from version 2"
[[ "$(anon_value "(public.v3_public_published_result_snapshot('$SHOW_ID')->'rows'->0) ? 'televotePoints'")" == 'f' ]] || fail "unpublished televote split leaked from version 2"

log "System V3 public exact-version result snapshot rehearsal passed"
