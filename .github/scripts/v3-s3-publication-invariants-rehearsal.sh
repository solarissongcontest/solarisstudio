#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-publication-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-publication-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal deliberately mutates fixtures. It must never run against the
# hosted Solaris project.
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

COUNTRY_ID='00000000-0000-4000-8000-00000000cb41'
EDITION_ID='00000000-0000-4000-8000-00000000ed41'
SHOW_ID='00000000-0000-4000-8000-00000000ab41'
RESULT_ID='00000000-0000-4000-8000-00000000bc41'
EXECUTION_ID='00000000-0000-4000-8000-00000000ec41'
OPERATION_ID='00000000-0000-4000-8000-00000000dc41'

log "Seeding one finalized immutable result version"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S3 Publication Country','P3B');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S3 Publication',2026,'s3-publication',9941,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config) values ('$SHOW_ID','$EDITION_ID','S3 Publication Final','final',1,false,'{}'::jsonb);"
db_exec "insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',12,10,22,1);"
db_exec "insert into public.studio2_result_operations(show_id,edition_id,calculation_version,last_calculated_at,reviewed_version,reviewed_at,locked_version,locked_at,reveal_ready_version,reveal_ready_at) values ('$SHOW_ID','$EDITION_ID',1,now(),1,now(),1,now(),1,now());"

[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '1' ]] || fail "immutable result version was not captured"
[[ "$(db_value "select private.v3_publication_result_version_release_ready('$SHOW_ID',1);")" == 't' ]] || fail "exact result version is not release ready"

log "Publishing one exact result version atomically"
db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb), published=true, updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public', version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=1,
      scheduled_for=null, scheduled_from_state=null, scheduled_by=null, scheduled_operation_id=null,
      last_failure=null, last_failure_at=null, updated_at=now()
  where show_id='$SHOW_ID';
commit;"

[[ "$(db_value "select state || ':' || source_result_version::text from public.studio2_show_publication_controls where show_id='$SHOW_ID';")" == 'public:1' ]] || fail "modern publication did not bind exact result version"

log "Modern public outcome state cannot lose or drift its exact provenance"
expect_db_failure "public outcome without result provenance" "update public.studio2_show_publication_controls set version=version+1,source_result_version=null where show_id='$SHOW_ID';"
expect_db_failure "publication version skip" "update public.studio2_show_publication_controls set version=version+2 where show_id='$SHOW_ID';"
expect_db_failure "invalid public to draft transition" "update public.studio2_show_publication_controls set state='draft',version=version+1,source_result_version=null where show_id='$SHOW_ID';"
expect_db_failure "public projection config drift" "update public.shows set publication_config=private.studio2_normalise_publication_config('{\"participants\":true}'::jsonb),updated_at=now() where id='$SHOW_ID';"
expect_db_failure "published result invalidation" "update public.studio2_result_operations set reviewed_version=null,reviewed_at=null where show_id='$SHOW_ID';"

log "Scheduling requires complete operation identity"
expect_db_failure "scheduled publication without actor and operation" "update public.studio2_show_publication_controls set state='scheduled',version=version+1,scheduled_from_state='public',scheduled_for=now()+interval '10 minutes',source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),source_result_version=1,scheduled_by=null,scheduled_operation_id=null where show_id='$SHOW_ID';"

log "Terminal execution evidence is exact, provenance-backed and immutable"
# S5 makes terminal scheduler execution a consequential fact. Seed the parent
# scheduling operation so this S3 fixture models the same causal chain as the
# real scheduler instead of fabricating an orphan scheduled_operation_id.
db_exec "insert into public.studio2_operation_receipts(
  operation_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at
) values (
  '$OPERATION_ID','$OPERATION_ID','$OPERATION_ID',repeat('c',64),'publication.show.change','R2',
  jsonb_build_object('editionId','$EDITION_ID','showId','$SHOW_ID'),'succeeded',
  jsonb_build_object('ok',true,'showId','$SHOW_ID','state','scheduled','version',(select version from public.studio2_show_publication_controls where show_id='$SHOW_ID')),
  now()
);"
db_exec "insert into public.studio2_show_publication_executions(id,show_id,edition_id,scheduled_operation_id,status,intended_config,source_show_updated_at,source_result_version,checks,failure_reason) values ('$EXECUTION_ID','$SHOW_ID','$EDITION_ID','$OPERATION_ID','succeeded',private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),(select updated_at from public.shows where id='$SHOW_ID'),1,'{}'::jsonb,null);"
expect_db_failure "execution rewrite" "update public.studio2_show_publication_executions set checks='{\"rewritten\":true}'::jsonb where id='$EXECUTION_ID';"
expect_db_failure "execution deletion" "delete from public.studio2_show_publication_executions where id='$EXECUTION_ID';"
expect_db_failure "duplicate schedule execution" "insert into public.studio2_show_publication_executions(show_id,edition_id,scheduled_operation_id,status,intended_config,source_result_version,checks) values ('$SHOW_ID','$EDITION_ID','$OPERATION_ID','succeeded',private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),1,'{}'::jsonb);"
expect_db_failure "successful execution with failure reason" "insert into public.studio2_show_publication_executions(show_id,edition_id,scheduled_operation_id,status,intended_config,source_result_version,checks,failure_reason) values ('$SHOW_ID','$EDITION_ID','00000000-0000-4000-8000-00000000dd41','succeeded',private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),1,'{}'::jsonb,'should not exist');"
expect_db_failure "blocked execution without failure reason" "insert into public.studio2_show_publication_executions(show_id,edition_id,scheduled_operation_id,status,intended_config,source_result_version,checks) values ('$SHOW_ID','$EDITION_ID','00000000-0000-4000-8000-00000000de41','blocked',private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),1,'{}'::jsonb);"
expect_db_failure "outcome execution without result version" "insert into public.studio2_show_publication_executions(show_id,edition_id,scheduled_operation_id,status,intended_config,source_result_version,checks) values ('$SHOW_ID','$EDITION_ID','00000000-0000-4000-8000-00000000df41','succeeded',private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),null,'{}'::jsonb);"

log "Making publication private releases Results for later revisions"
db_exec "begin;
  update public.shows set published=false,updated_at=now() where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='hidden',version=version+1,source_result_version=null,scheduled_for=null,scheduled_from_state=null,scheduled_by=null,scheduled_operation_id=null,last_failure=null,last_failure_at=null,updated_at=now()
  where show_id='$SHOW_ID';
commit;"
db_exec "update public.studio2_result_operations set reviewed_version=null,reviewed_at=null,locked_version=null,locked_at=null,reveal_ready_version=null,reveal_ready_at=null where show_id='$SHOW_ID';"

[[ "$(db_value "select count(*) from pg_constraint where conname in ('studio2_show_publication_controls_failure_pair_v3_check','studio2_show_publication_controls_schedule_owner_v3_check','studio2_show_publication_executions_terminal_v3_check','studio2_show_publication_executions_operation_v3_check') and convalidated;")" == '4' ]] || fail "S3 Publication staged checks are not all validated"
[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_validate_publication_control','v3_validate_publication_execution','v3_reject_publication_execution_mutation','v3_validate_publication_projection_from_control','v3_validate_publication_projection_from_show','v3_validate_publication_projection_from_results') and tgenabled <> 'D';")" == '6' ]] || fail "S3 Publication invariant triggers are not enabled"
[[ "$(db_value "select count(*) from pg_indexes where schemaname='public' and indexname='studio2_show_publication_executions_operation_v3_uidx';")" == '1' ]] || fail "S3 Publication execution identity index is missing"

log "System V3 S3 Publication invariant rehearsal passed"
