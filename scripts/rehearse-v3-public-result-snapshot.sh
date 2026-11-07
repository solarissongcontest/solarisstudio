#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-public-result-snapshot] %s\n' "$*"; }
fail() { printf '\n[v3-public-result-snapshot] FAIL: %s\n' "$*" >&2; exit 1; }

# Fail closed when the local Supabase CLI is unavailable.
status_env="$(supabase status -o env)" || fail "No local Supabase stack"
# The CLI prints assignment-shaped data, NOT trusted shell code. Never eval it.
# Reject malformed lines and duplicate authorities before any database call.
API_URL=""
DB_URL=""
api_count=0
db_count=0
while IFS= read -r entry || [[ -n "$entry" ]]; do
  [[ -z "$entry" ]] && continue
  [[ "$entry" =~ ^[A-Z][A-Z0-9_]*= ]] || fail "Malformed local Supabase status output"
  case "$entry" in
    API_URL=*)
      api_count=$((api_count + 1))
      [[ $api_count -eq 1 ]] || fail "Duplicate local Supabase API_URL"
      API_URL="${entry#API_URL=}"
      ;;
    DB_URL=*)
      db_count=$((db_count + 1))
      [[ $db_count -eq 1 ]] || fail "Duplicate local Supabase DB_URL"
      DB_URL="${entry#DB_URL=}"
      ;;
  esac
done <<< "$status_env"
[[ $api_count -eq 1 && $db_count -eq 1 ]] || fail "Missing local Supabase endpoints"

# Supabase may quote literal values in env output. Only remove paired outer
# quotes; do not interpret escapes, substitutions, commands, or shell syntax.
strip_outer_quotes() {
  local value="$1"
  if (( ${#value} >= 2 )); then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf "%s" "$value"
}
API_URL="$(strip_outer_quotes "$API_URL")"
DB_URL="$(strip_outer_quotes "$DB_URL")"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

# Prefix checks misread 'localhost:54321@remote.example' as loopback;
# libpq query-string host overrides are equally dangerous.
# Parse whole authorities before making ANY SQL connection.
command -v node >/dev/null 2>&1 || fail "Node is required for the local-only URL safety check"
node - "$API_URL" "$DB_URL" <<'NODE' || fail "Refusing hosted/non-loopback rehearsal endpoints"
const [apiRaw, dbRaw] = process.argv.slice(2);
const localhost = (host) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";
const parsed = (raw) => {
  if (!raw || /[\s\\]/.test(raw)) throw new Error("Malformed endpoint");
  return new URL(raw);
};
try {
  const api = parsed(apiRaw);
  if (
    api.protocol !== "http:" || !localhost(api.hostname) || !api.port ||
    api.username || api.password || api.search || api.hash || api.pathname !== "/"
  ) throw new Error("API URL must be a bare loopback HTTP origin with an explicit port");
  const db = parsed(dbRaw);
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !localhost(db.hostname) || !db.port ||
    db.username !== "postgres" || db.password !== "postgres" ||
    db.pathname !== "/postgres" || db.search || db.hash
  ) throw new Error("Database URL must identify local PostgreSQL without overrides");
  // A loopback URL is insufficient if libpq receives an ambient host/service
  // override. Deny these before the FIRST psql invocation.
  for (const variable of ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) {
    if (process.env[variable]) throw new Error("libpq connection override forbidden: " + variable);
  }
} catch (error) {
  process.stderr.write("Local-only URL preflight rejected endpoint: " + error.message + "\n");
  process.exit(1);
}
NODE

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
