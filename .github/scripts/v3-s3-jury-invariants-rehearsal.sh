#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-jury-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-jury-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# These fixtures are destructive by design. This rehearsal is local-only and
# must fail closed instead of ever acquiring a hosted Supabase fallback.
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

COUNTRY_A='00000000-0000-4000-8000-00000000c891'
COUNTRY_B='00000000-0000-4000-8000-00000000c892'
EDITION_A='00000000-0000-4000-8000-00000000e891'
EDITION_B='00000000-0000-4000-8000-00000000e892'
SHOW_A='00000000-0000-4000-8000-00000000a891'
SHOW_A2='00000000-0000-4000-8000-00000000a892'
SHOW_B='00000000-0000-4000-8000-00000000a893'
USER_A='00000000-0000-4000-8000-00000000d891'
USER_B='00000000-0000-4000-8000-00000000d892'
PREFLIGHT_ID='00000000-0000-4000-8000-00000000f891'
BALLOT_ID='00000000-0000-4000-8000-00000000b891'

log "Seeding isolated Jury invariant fixtures"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_A','S3 Jury Invariant A','J3A'),('$COUNTRY_B','S3 Jury Invariant B','J3B');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_A','S3 Jury Invariant A',2026,'s3-jury-invariant-a',9891,'active',false),('$EDITION_B','S3 Jury Invariant B',2026,'s3-jury-invariant-b',9892,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config) values ('$SHOW_A','$EDITION_A','S3 Jury A','final',1,false,'{}'::jsonb),('$SHOW_A2','$EDITION_A','S3 Jury A2','semi-final',2,false,'{}'::jsonb),('$SHOW_B','$EDITION_B','S3 Jury B','final',1,false,'{}'::jsonb);"
db_exec "insert into public.jury_voting_windows(show_id,edition_id,status,opened_at) values ('$SHOW_A','$EDITION_A','open',now());"

log "Window scope and one-open-per-edition rules are database-enforced"
expect_db_failure "cross-edition Jury window" "insert into public.jury_voting_windows(show_id,edition_id,status) values ('$SHOW_B','$EDITION_A','closed');"
expect_db_failure "second open Jury window in one edition" "insert into public.jury_voting_windows(show_id,edition_id,status,opened_at) values ('$SHOW_A2','$EDITION_A','open',now());"
expect_db_failure "open Jury window without opened_at" "update public.jury_voting_windows set opened_at=null where show_id='$SHOW_A';"

log "Creating one exact modern ballot/preflight pair"
db_exec "begin; insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at) values ('$PREFLIGHT_ID',null,'s3-jury-invariant-a','J3A','{}'::jsonb,'jury','$EDITION_A','$SHOW_A','$USER_A',now()+interval '20 minutes'); insert into public.jury_ballot_submissions(id,edition_id,show_id,user_id,voter_country_id,preflight_id) values ('$BALLOT_ID','$EDITION_A','$SHOW_A','$USER_A','$COUNTRY_A','$PREFLIGHT_ID'); update televoting.vote_preflight_checks set jury_ballot_submission_id='$BALLOT_ID',submitted_at=now() where id='$PREFLIGHT_ID'; commit;"

[[ "$(db_value "select count(*) from public.jury_ballot_submissions where id='$BALLOT_ID';")" == '1' ]] || fail "valid exact Jury ballot/preflight pair was not committed"

log "Modern ballot and preflight scope cannot drift after commit"
expect_db_failure "preflight account drift" "update televoting.vote_preflight_checks set account_user_id='$USER_B' where id='$PREFLIGHT_ID';"
expect_db_failure "ballot edition drift" "update public.jury_ballot_submissions set edition_id='$EDITION_B' where id='$BALLOT_ID';"
expect_db_failure "review state without required reason" "update public.jury_ballot_submissions set status='needs_review',reviewed_at=now() where id='$BALLOT_ID';"

log "Did-not-vote evidence cannot coexist with a submitted ballot"
expect_db_failure "DNV plus submitted ballot" "insert into public.jury_ballot_statuses(edition_id,show_id,voter_country_id,status) values ('$EDITION_A','$SHOW_A','$COUNTRY_A','did_not_vote');"

[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_s3_validate_jury_window_scope','v3_s3_validate_jury_submission_scope','v3_s3_validate_jury_preflight_ballot_link','v3_s3_validate_jury_vote_ballot_scope','v3_s3_validate_jury_dnv_scope') and tgenabled <> 'D';")" == '5' ]] || fail "S3 Jury invariant triggers are not all enabled"
[[ "$(db_value "select count(*) from pg_constraint where conname in ('jury_voting_windows_lifecycle_v3_check','jury_ballot_submissions_review_lifecycle_v3_check','jury_ballot_statuses_timeline_v3_check') and convalidated;")" == '3' ]] || fail "S3 Jury staged constraints are not all validated"
[[ "$(db_value "select count(*) from pg_indexes where schemaname='public' and indexname='jury_voting_windows_one_open_per_edition_v3_idx';")" == '1' ]] || fail "S3 Jury one-open-window index is missing"

log "System V3 S3 Jury invariant rehearsal passed"
