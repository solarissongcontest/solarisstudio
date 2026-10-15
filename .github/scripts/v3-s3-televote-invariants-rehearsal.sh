#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-televote-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-televote-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# These fixtures are intentionally destructive. They may run only against the
# disposable loopback Supabase stack used by migration CI.
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

EDITION_ID='00000000-0000-4000-8000-000000009901'
ROUND_ID='00000000-0000-4000-8000-000000009902'
SUBMISSION_ID='00000000-0000-4000-8000-000000009903'
PREFLIGHT_ID='00000000-0000-4000-8000-000000009904'
HISTORICAL_ID='00000000-0000-4000-8000-000000009905'

log "Seeding isolated Televote invariant fixtures"
db_exec "insert into televoting.countries(code,name) values ('T3H','S3 Televote Home'),('T3X','S3 Televote Alternate');"
db_exec "insert into televoting.editions(id,name) values ('$EDITION_ID','S3 Televote Invariants');"
db_exec "insert into televoting.rounds(id,edition_id,name,status) values ('$ROUND_ID','$EDITION_ID','S3 Televote Round','closed');"
db_exec "insert into televoting.round_entries(round_id,entry_type,entry_key,custom_name,display_order) select '$ROUND_ID'::uuid,'custom',entry_key,'S3 target ' || entry_key,ord::int from unnest(array['T3A','T3B','T3C','T3D','T3E']) with ordinality as target(entry_key,ord);"

log "Legacy custom-entry fallback resolves pgcrypto through the hardened schema"
AUTO_KEY="$(db_value "insert into televoting.round_entries(round_id,entry_type,entry_key,custom_name,display_order) values ('$ROUND_ID','custom',null,'Generated-key rehearsal',99) returning entry_key;")"
[[ "$AUTO_KEY" =~ ^x_[0-9a-f]{12}$ ]] || fail "generated round-entry key has unexpected format: $AUTO_KEY"

db_exec "insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code,status) values ('$SUBMISSION_ID','$ROUND_ID','S3 Televote Voter','s3 televote voter','T3H','active');"
db_exec "insert into televoting.vote_entries(submission_id,target_country_code,points) select '$SUBMISSION_ID'::uuid,entry_key,4 from unnest(array['T3A','T3B','T3C','T3D','T3E']) entry_key;"
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,submission_id,submitted_at) values ('$PREFLIGHT_ID','$ROUND_ID','s3 televote voter','T3H','{\"T3A\":4,\"T3B\":4,\"T3C\":4,\"T3D\":4,\"T3E\":4}'::jsonb,'televote','$SUBMISSION_ID',now());"

[[ "$(db_value "select count(*) from televoting.vote_preflight_checks where id='$PREFLIGHT_ID' and submission_id='$SUBMISSION_ID';")" == '1' ]] || fail "valid completed Televote preflight was not committed"

log "Modern ballot identity and round scope are database-enforced"
expect_db_failure "unnormalized modern username" "insert into televoting.vote_submissions(round_id,username,username_normalized,country_code,status) values ('$ROUND_ID','Other Modern Voter','NOT NORMALIZED','T3H','deleted');"
expect_db_failure "unknown modern home country" "insert into televoting.vote_submissions(round_id,username,username_normalized,country_code,status) values ('$ROUND_ID','Unknown Country Voter','unknown country voter','NO_SUCH_COUNTRY','deleted');"
expect_db_failure "entry history flag drift" "update televoting.vote_entries set is_historical=true where submission_id='$SUBMISSION_ID' and target_country_code='T3A';"
expect_db_failure "entry outside ballot round" "update televoting.vote_entries set target_country_code='OUTSIDE' where submission_id='$SUBMISSION_ID' and target_country_code='T3A';"
expect_db_failure "ballot country drift from completed preflight" "update televoting.vote_submissions set country_code='T3X' where id='$SUBMISSION_ID';"
expect_db_failure "duplicate completed preflight link" "insert into televoting.vote_preflight_checks(round_id,username_normalized,country_code,ballot_map,channel,submission_id,submitted_at) values ('$ROUND_ID','s3 televote voter','T3H','{}'::jsonb,'televote','$SUBMISSION_ID',now());"
expect_db_failure "completed preflight identity drift" "update televoting.vote_preflight_checks set country_code='T3X' where id='$PREFLIGHT_ID';"

log "Historical ballots remain preserved outside modern-only scope guards"
db_exec "insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code,status,is_historical) values ('$HISTORICAL_ID','$ROUND_ID','Historical Imported Ballot','legacy-import-key','LEGACY-UNKNOWN','active',true);"
db_exec "insert into televoting.vote_entries(submission_id,target_country_code,points,is_historical) values ('$HISTORICAL_ID','LEGACY-TARGET',42,true);"
[[ "$(db_value "select count(*) from televoting.vote_entries where submission_id='$HISTORICAL_ID' and is_historical and points=42;")" == '1' ]] || fail "historical evidence was not preserved"

[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_s3_guard_televote_submission_identity','v3_s3_guard_televote_entry_scope','v3_s3_validate_televote_preflight_link') and tgenabled <> 'D';")" == '3' ]] || fail "S3 Televote invariant triggers are not all enabled"
[[ "$(db_value "select count(*) from pg_constraint where conname in ('vote_submissions_modern_identity_v3_check','vote_preflight_checks_televote_binding_state_v3_check') and convalidated;")" == '2' ]] || fail "S3 Televote staged constraints are not all validated"
[[ "$(db_value "select count(*) from pg_indexes where schemaname='televoting' and indexname='vote_preflight_checks_televote_submission_v3_idx';")" == '1' ]] || fail "S3 Televote one-preflight-per-ballot index is missing"

log "System V3 S3 Televote invariant rehearsal passed"
