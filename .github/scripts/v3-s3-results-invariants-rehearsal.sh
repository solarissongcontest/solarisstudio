#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-results-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-results-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Fixtures are destructive and must never run against hosted Supabase.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
expect_db_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000ca31'
EDITION_A='00000000-0000-4000-8000-00000000ea31'
EDITION_B='00000000-0000-4000-8000-00000000eb31'
SHOW_ID='00000000-0000-4000-8000-00000000aa31'
RESULT_ID='00000000-0000-4000-8000-00000000ba31'

log "Seeding one exact result version"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S3 Results Country','S3R');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_A','S3 Results A',2026,'s3-results-a',9931,'active',false),('$EDITION_B','S3 Results B',2026,'s3-results-b',9932,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published) values ('$SHOW_ID','$EDITION_A','S3 Results Final','final',1,false);"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_A','$SHOW_ID','$COUNTRY_ID',12,-2,10,1);"
db_exec "insert into public.studio2_result_operations(show_id,edition_id,calculation_version,reviewed_version,locked_version,reveal_ready_version) values ('$SHOW_ID','$EDITION_A',1,1,1,1);"

[[ "$(db_value "select result_row_count from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '1' ]] || fail "calculation version did not capture exactly one result row"
[[ "$(db_value "select result_rows->0->>'televotePoints' from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '-2' ]] || fail "supported negative televote adjustment was not preserved"

log "Mutable current standings cannot rewrite immutable version evidence"
db_exec "update public.results set jury_points=22,total_points=20 where id='$RESULT_ID';"
[[ "$(db_value "select result_rows->0->>'juryPoints' from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '12' ]] || fail "version evidence changed with mutable current standings"
expect_db_failure "snapshot rewrite" "update private.v3_result_versions set result_row_count=0 where show_id='$SHOW_ID' and version=1;"
expect_db_failure "snapshot deletion" "delete from private.v3_result_versions where show_id='$SHOW_ID' and version=1;"

log "Version pointers and show scope require exact database evidence"
expect_db_failure "missing reviewed version" "update public.studio2_result_operations set reviewed_version=2 where show_id='$SHOW_ID';"
expect_db_failure "missing publication version" "update public.studio2_show_publication_controls set source_result_version=2 where show_id='$SHOW_ID';"
expect_db_failure "cross-edition result" "update public.results set edition_id='$EDITION_B' where id='$RESULT_ID';"
expect_db_failure "skipped calculation version" "update public.studio2_result_operations set calculation_version=3,reviewed_version=null,locked_version=null,reveal_ready_version=null where show_id='$SHOW_ID';"

[[ "$(db_value "select count(*) from pg_constraint where conname in ('results_show_edition_v3_fk','studio2_result_operations_show_edition_v3_fk','studio2_result_operation_executions_show_edition_v3_fk','studio2_show_publication_controls_show_edition_v3_fk','studio2_show_publication_executions_show_edition_v3_fk','studio2_show_publication_source_snapshot_v3_fk','studio2_show_publication_executions_source_snapshot_v3_fk') and convalidated;")" == '7' ]] || fail "S3 Results staged constraints are not all validated"
[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_capture_result_version','v3_reject_result_version_mutation') and tgenabled <> 'D';")" == '2' ]] || fail "S3 Results invariant triggers are not enabled"

log "System V3 S3 Results invariant rehearsal passed"
