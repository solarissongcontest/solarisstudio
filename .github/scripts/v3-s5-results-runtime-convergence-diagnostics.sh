#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-results-runtime] %s\n' "$*"; }
fail() { printf '\n[v3-s5-results-runtime] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase runtime diagnostics ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database runtime diagnostics" ;;
esac

db_value() {
  PGAPPNAME='solaris-s5-results-runtime' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -qAt -c "$1"
}

db_exec() {
  PGAPPNAME='solaris-s5-results-runtime' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -c "$1" >/dev/null
}

db_print() {
  PGAPPNAME='solaris-s5-results-runtime' psql "$DB_URL" -v ON_ERROR_STOP=1 -X -P pager=off -c "$1"
}

QUAL_EDITION_ID='00000000-0000-4000-8000-00000000e971'
QUAL_SEMI_ONE_ID='00000000-0000-4000-8000-00000000a971'
SUBJECT_COUNTRY_ID='00000000-0000-4000-8a00-000000000001'
REPLACEMENT_COUNTRY_ID='00000000-0000-4000-8a00-000000000011'
EVIDENCE_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
EVIDENCE_PATH="${S5_RESULTS_RUNTIME_EVIDENCE:-$EVIDENCE_DIR/s5-results-runtime-convergence.txt}"
mkdir -p "$(dirname "$EVIDENCE_PATH")"
: >"$EVIDENCE_PATH"

log "Capturing live migrated trigger/function inventory"
{
  printf '=== trigger inventory ===\n'
  db_print "
select
  ns.nspname as table_schema,
  cls.relname as table_name,
  trg.tgname as trigger_name,
  trg.tgenabled,
  trg.tgdeferrable,
  trg.tginitdeferred,
  proc.oid::regprocedure as function_signature,
  pg_get_triggerdef(trg.oid, true) as trigger_definition
from pg_trigger trg
join pg_class cls on cls.oid=trg.tgrelid
join pg_namespace ns on ns.oid=cls.relnamespace
join pg_proc proc on proc.oid=trg.tgfoid
where ns.nspname='public'
  and cls.relname in ('participants','results','studio2_result_operations')
  and not trg.tgisinternal
order by cls.relname,trg.tgname;
"
  printf '\n=== canonical function definitions ===\n'
  db_print "select pg_get_functiondef('public.sync_results_after_participant_change()'::regprocedure);"
  db_print "select pg_get_functiondef('public.sync_show_results_from_votes(uuid)'::regprocedure);"
  db_print "select pg_get_functiondef('public.refresh_edition_qualifications(uuid)'::regprocedure);"
  db_print "select pg_get_functiondef('private.v3_refresh_qualifications_after_participation_status()'::regprocedure);"
} | tee "$EVIDENCE_PATH"

[[ "$(db_value "
select count(*)
from pg_trigger trg
join pg_class cls on cls.oid=trg.tgrelid
join pg_namespace ns on ns.oid=cls.relnamespace
where ns.nspname='public'
  and cls.relname='participants'
  and trg.tgname='participants_sync_results'
  and trg.tgenabled in ('O','A')
  and not trg.tgdeferrable
  and not trg.tginitdeferred
  and pg_get_triggerdef(trg.oid,true) ilike '%participation_status%';
")" == '1' ]] || fail "runtime participants_sync_results is missing, disabled, deferred, or does not cover participation_status"

[[ "$(db_value "
select count(*)
from pg_trigger trg
join pg_class cls on cls.oid=trg.tgrelid
join pg_namespace ns on ns.oid=cls.relnamespace
where ns.nspname='public'
  and cls.relname='participants'
  and trg.tgname='v3_participation_status_refresh_qualifications'
  and trg.tgenabled in ('O','A')
  and not trg.tgdeferrable
  and not trg.tginitdeferred
  and pg_get_triggerdef(trg.oid,true) ilike '%after update of participation_status%'
  and pg_get_triggerdef(trg.oid,true) ilike '%is distinct from%';
")" == '1' ]] || fail "runtime qualification refresh trigger does not match the synchronous status-change contract"

[[ "$(db_value "select (to_regprocedure('public.sync_results_after_participant_change()') is not null)::int;")" == '1' ]] || fail "runtime sync_results_after_participant_change() is missing"
[[ "$(db_value "select (to_regprocedure('public.sync_show_results_from_votes(uuid)') is not null)::int;")" == '1' ]] || fail "runtime sync_show_results_from_votes(uuid) is missing"
[[ "$(db_value "select (to_regprocedure('public.refresh_edition_qualifications(uuid)') is not null)::int;")" == '1' ]] || fail "runtime refresh_edition_qualifications(uuid) is missing"

snapshot_state() {
  local label="$1"
  {
    printf '\n=== state %s ===\n' "$label"
    db_print "
select
  participant.country_id,
  participant.participation_status,
  participant.qualified,
  result_row.jury_points,
  result_row.televote_points,
  result_row.total_points,
  result_row.final_rank
from public.participants participant
left join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.show_id='$QUAL_SEMI_ONE_ID'::uuid
  and participant.country_id in ('$SUBJECT_COUNTRY_ID'::uuid,'$REPLACEMENT_COUNTRY_ID'::uuid)
order by participant.country_id;
"
  } | tee -a "$EVIDENCE_PATH"
}

raw_vote_hash() {
  db_value "
with source_rows as (
  select 'jury'::text as source, to_jsonb(vote_row) as payload
  from public.jury_votes vote_row
  where vote_row.edition_id='$QUAL_EDITION_ID'::uuid

  union all

  select 'televote'::text as source, to_jsonb(vote_row) as payload
  from public.televote_votes vote_row
  where vote_row.edition_id='$QUAL_EDITION_ID'::uuid
)
select md5(
  coalesce(
    jsonb_agg(
      jsonb_build_object('source',source,'payload',payload)
      order by source,payload::text
    )::text,
    '[]'
  )
)
from source_rows;
"
}

result_hash() {
  db_value "
select md5(
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'show_id',show_id,
        'country_id',country_id,
        'jury_points',jury_points,
        'televote_points',televote_points,
        'total_points',total_points,
        'final_rank',final_rank
      ) order by show_id,country_id
    )::text,
    '[]'
  )
)
from public.results
where edition_id='$QUAL_EDITION_ID'::uuid;
"
}

qualification_hash() {
  db_value "
select md5(
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'show_id',show_id,
        'country_id',country_id,
        'participation_status',participation_status,
        'qualified',qualified
      ) order by show_id,country_id
    )::text,
    '[]'
  )
)
from public.participants
where edition_id='$QUAL_EDITION_ID'::uuid;
"
}

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$SUBJECT_COUNTRY_ID'::uuid
  and participant.participation_status='confirmed'
  and participant.qualified is true
  and result_row.final_rank between 1 and 10;
")" == '1' ]] || fail "diagnostic precondition: subject is not a confirmed top-ten qualifier"

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$REPLACEMENT_COUNTRY_ID'::uuid
  and participant.qualified is false
  and result_row.final_rank=11;
")" == '1' ]] || fail "diagnostic precondition: replacement is not canonical rank 11"

VOTE_HASH_BEFORE="$(raw_vote_hash)"
[[ -n "$VOTE_HASH_BEFORE" ]] || fail "raw vote source hash is empty"
snapshot_state A-before-withdrawal

log "Direct SQL withdrawal must synchronously rerank Results and refresh qualification"
db_exec "
update public.participants
set participation_status='withdrawn'
where edition_id='$QUAL_EDITION_ID'::uuid
  and country_id='$SUBJECT_COUNTRY_ID'::uuid;
"
snapshot_state B-after-withdrawal

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$SUBJECT_COUNTRY_ID'::uuid
  and participant.participation_status='withdrawn'
  and participant.qualified is false
  and result_row.final_rank is null;
")" == '1' ]] || fail "withdrawal did not clear subject rank/qualification synchronously"

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$REPLACEMENT_COUNTRY_ID'::uuid
  and participant.qualified is true
  and result_row.final_rank=10;
")" == '1' ]] || fail "withdrawal did not promote the rank-11 replacement to rank 10"

[[ "$(db_value "select count(*) from public.participants where edition_id='$QUAL_EDITION_ID'::uuid and qualified is true;")" == '20' ]] || fail "withdrawal changed canonical qualifier cardinality"
[[ "$(raw_vote_hash)" == "$VOTE_HASH_BEFORE" ]] || fail "withdrawal mutated authoritative raw jury/televote rows"
snapshot_state C-before-reconfirmation

log "Direct SQL reconfirmation must reconstruct rank and qualification from preserved source votes"
db_exec "
update public.participants
set participation_status='confirmed'
where edition_id='$QUAL_EDITION_ID'::uuid
  and country_id='$SUBJECT_COUNTRY_ID'::uuid;
"
snapshot_state D-after-reconfirmation

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$SUBJECT_COUNTRY_ID'::uuid
  and participant.participation_status='confirmed'
  and participant.qualified is true
  and result_row.final_rank between 1 and 10;
")" == '1' ]] || fail "reconfirmation did not restore the original top-ten participant"

[[ "$(db_value "
select count(*)
from public.participants participant
join public.results result_row
  on result_row.show_id=participant.show_id
 and result_row.country_id=participant.country_id
where participant.edition_id='$QUAL_EDITION_ID'::uuid
  and participant.country_id='$REPLACEMENT_COUNTRY_ID'::uuid
  and participant.qualified is false
  and result_row.final_rank=11;
")" == '1' ]] || fail "reconfirmation did not return the replacement below the cutoff"

[[ "$(db_value "select count(*) from public.participants where edition_id='$QUAL_EDITION_ID'::uuid and qualified is true;")" == '20' ]] || fail "reconfirmation changed canonical qualifier cardinality"
[[ "$(raw_vote_hash)" == "$VOTE_HASH_BEFORE" ]] || fail "reconfirmation mutated authoritative raw jury/televote rows"

RESULT_HASH_BEFORE_IDEMPOTENT="$(result_hash)"
QUAL_HASH_BEFORE_IDEMPOTENT="$(qualification_hash)"
log "Repeating confirmed -> confirmed must be idempotent even though UPDATE OF can fire"
db_exec "
update public.participants
set participation_status='confirmed'
where edition_id='$QUAL_EDITION_ID'::uuid
  and country_id='$SUBJECT_COUNTRY_ID'::uuid;
"
[[ "$(result_hash)" == "$RESULT_HASH_BEFORE_IDEMPOTENT" ]] || fail "idempotent confirmed update changed canonical Results"
[[ "$(qualification_hash)" == "$QUAL_HASH_BEFORE_IDEMPOTENT" ]] || fail "idempotent confirmed update changed qualification projection"
[[ "$(raw_vote_hash)" == "$VOTE_HASH_BEFORE" ]] || fail "idempotent confirmed update changed authoritative raw votes"

snapshot_state E-after-idempotent-confirmed-update
{
  printf '\nraw_jury_televote_hash=%s\n' "$VOTE_HASH_BEFORE"
  printf 'result_hash_after_reconfirmation=%s\n' "$RESULT_HASH_BEFORE_IDEMPOTENT"
  printf 'qualification_hash_after_reconfirmation=%s\n' "$QUAL_HASH_BEFORE_IDEMPOTENT"
} | tee -a "$EVIDENCE_PATH"

log "S5_RESULT_RUNTIME_SCHEMA_PROVEN"
log "S5_RESULT_RAW_VOTE_PRESERVATION_PROVEN"
log "S5_RESULT_STATUS_ROUNDTRIP_IDEMPOTENT"
log "S5 Results runtime convergence diagnostics passed"
