#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-confirmation-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-confirmation-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal writes destructive fixtures and is local-only by design.
if [[ -z "${DB_URL:-}" ]]; then eval "$(supabase status -o env)"; fi
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

COUNTRY_A='00000000-0000-4000-8000-00000000c901'
COUNTRY_B='00000000-0000-4000-8000-00000000c902'
EDITION_ID='00000000-0000-4000-8000-00000000e901'
ROUND_A='00000000-0000-4000-8000-00000000a901'
ROUND_B='00000000-0000-4000-8000-00000000a902'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f901'
REQUIREMENT_A='00000000-0000-4000-8000-00000000d901'
REQUIREMENT_B='00000000-0000-4000-8000-00000000d902'

log "Seeding two delegations and one edition-level requirement"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_A','S3 Confirmation A','S3A'),('$COUNTRY_B','S3 Confirmation B','S3B');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S3 Confirmation Invariants',2026,'s3-confirmation-invariants',9901,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_A','$EDITION_ID','S3 first window','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.studio2_confirmation_requirements(id,edition_id,country_id,generation,status,reason,valid_from) values ('$REQUIREMENT_A','$EDITION_ID','$COUNTRY_A',1,'required','S3 invariant fixture',now()-interval '5 minutes');"

expect_db_failure "duplicate effective requirement" "insert into public.studio2_confirmation_requirements(edition_id,country_id,generation,status,reason) values ('$EDITION_ID','$COUNTRY_A',2,'required','Duplicate effective requirement');"

log "A later round remains only a window"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_B','$EDITION_ID','S3 later window','open',now()-interval '1 hour',now()+interval '2 hours',true);"
[[ "$(db_value "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_A';")" == '1' ]] || fail "later round recreated an edition requirement"

log "A canonical submission resolves its exact edition/delegation requirement"
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,browser_session_id) values ('$SUBMISSION_ID','$EDITION_ID','$ROUND_A','s3_invariant','S3 Confirmation A',true,'s3-invariant-session');"
[[ "$(db_value "select status || ':' || resolved_by_submission_id::text from public.studio2_confirmation_requirements where id='$REQUIREMENT_A';")" == "satisfied:$SUBMISSION_ID" ]] || fail "submission did not resolve the canonical requirement"

expect_db_failure "malformed required lifecycle" "update public.studio2_confirmation_requirements set status='required' where id='$REQUIREMENT_A';"

log "A linked resolution cannot cross delegation scope"
db_exec "insert into public.studio2_confirmation_requirements(id,edition_id,country_id,generation,status,reason,valid_from) values ('$REQUIREMENT_B','$EDITION_ID','$COUNTRY_B',1,'required','S3 scope fixture',now()-interval '5 minutes');"
expect_db_failure "cross-delegation resolution link" "update public.studio2_confirmation_requirements set status='satisfied',resolved_at=now(),resolved_by_submission_id='$SUBMISSION_ID' where id='$REQUIREMENT_B';"

[[ "$(db_value "select convalidated::text from pg_constraint where conname='studio2_confirmation_requirement_lifecycle_v3_check';")" == 'true' ]] || fail "staged lifecycle constraint was not validated"
[[ "$(db_value "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and superseded_at is null group by edition_id,country_id having count(*) > 1;")" == '' ]] || fail "duplicate effective requirements survived"

log "System V3 S3 Confirmation invariant rehearsal passed"
