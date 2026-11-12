#!/usr/bin/env bash
set -euo pipefail
# LOCAL DISPOSABLE SUPABASE ONLY. Never supply hosted credentials or endpoints.
fail() { echo "V3 NEXT IN LINE LOCAL FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
[[ -f supabase/config.toml && $# -eq 0 ]] || fail "Requires repository-local stack"
for name in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN SUPABASE_SERVICE_ROLE_KEY PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE; do
  [[ -z "$(printenv "$name" || true)" ]] || fail "Unexpected $name"
done
eval "$(supabase status -o env)" || fail "Local stack unavailable"
: "$API_URL" "$DB_URL"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Hosted API target";; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Hosted DB target";; esac
[[ "$(git rev-parse HEAD)" == "$V3_EXACT_SHA" ]] || fail "Commit SHA mismatch"

scalar() { psql "$DB_URL" -w -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }
sql() { psql "$DB_URL" -w -X -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null; }
role_call() {
  psql "$DB_URL" -w -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
    -c "set role authenticated; set request.jwt.claim.sub='$1'; $2"
}
deny() {
  local description="$1" actor="$2" command="$3" expect="$4" output
  if output="$(role_call "$actor" "$command" 2>&1)"; then fail "$description unexpectedly succeeded"; fi
  [[ "$output" == *"$expect"* ]] || fail "$description unexpected error: $output"
  pass "$description"
}
check_count() {
  local actual
  actual="$(scalar "$2")"
  [[ "$actual" == "$3" ]] || fail "$1: expected $3 got $actual"
  pass "$1"
}
psql "$DB_URL" -w -X -q -v ON_ERROR_STOP=1 \
  -f docs/v3/recovery-candidates/next-in-line-softlaunch-rollout-local.sql >/dev/null
pass "Local-only candidate SQL applied"
[[ "$(scalar "select has_function_privilege('anon','public.v3_submit_next_in_line(jsonb,uuid,text)','EXECUTE');")" == f ]] || fail "Anon EXECUTE allowed"
[[ "$(scalar "select has_function_privilege('authenticated','public.v3_submit_next_in_line(jsonb,uuid,text)','EXECUTE');")" == t ]] || fail "Auth EXECUTE missing"
[[ "$(scalar "select has_function_privilege('authenticated','private.studio2_feature_enabled_for(uuid,text,uuid)','EXECUTE');")" == f ]] || fail "Rollout helper leaked"
pass "Canonical RPC role ACLs unchanged"

ACTOR='00000000-0000-4000-8000-00000000e901'
OTHER='00000000-0000-4000-8000-00000000e902'
ED='00000000-0000-4000-8000-00000000e911'
ED2='00000000-0000-4000-8000-00000000e912'
SHOW='00000000-0000-4000-8000-00000000e921'
COUNTRY='00000000-0000-4000-8000-00000000e931'
ROUND='00000000-0000-4000-8000-00000000e941'
SOURCE='00000000-0000-4000-8000-00000000e951'
ENTRY='00000000-0000-4000-8000-00000000e961'
OP='00000000-0000-4000-8000-00000000e971'
# Use the real canonical source/actor/window validators and real tables.
sql "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('$ACTOR','authenticated','authenticated','next-line-a@solaris.invalid',now(),now()),
 ('$OTHER','authenticated','authenticated','next-line-b@solaris.invalid',now(),now());
insert into public.countries(id,name,short_code) values ('$COUNTRY','Next Line Land','NLL');
insert into public.editions(id,name,slug,edition_number,status,published) values
 ('$ED','Next Line Candidate','next-line-candidate',9891,'active',false),
 ('$ED2','Next Line Other','next-line-other',9892,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published) values
 ('$SHOW','$ED','Next Line Show','final',1,false);
insert into public.participants(id,edition_id,show_id,country_id,artist,song,semi_final)
 values ('00000000-0000-4000-8000-00000000e922','$ED','$SHOW','$COUNTRY','Prior Artist','Prior Song','final');
insert into public.country_accounts(user_id,country_id,status)
 values ('$ACTOR','$COUNTRY','active');
insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status)
 values ('$ACTOR','$COUNTRY','$ED','mine');
insert into public.submission_rounds(id,edition_id,name,status)
 values ('$ROUND','$ED','Prior Confirmation','closed');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,selection_method,participating)
 values ('$SOURCE','$ED','$ROUND','nextline','Next Line Land','internal',true);
insert into public.internal_entries(id,submission_id,artist,song_title,review_status)
 values ('$ENTRY','$SOURCE','Prior Artist','Prior Song','accepted');
insert into public.studio2_next_in_line_windows(edition_id,enabled,status,opens_at,closes_at)
 values ('$ED',true,'open',now()-interval '1 hour',now()+interval '2 hours');
"
check_count "Source genuinely eligible" "select count(*) from public.submissions s where id='$SOURCE' and private.studio2_next_in_line_source_eligible(s.id);" 1
check_count "Canonical real window open" "select count(*) from public.studio2_next_in_line_windows w where w.edition_id='$ED' and private.studio2_next_in_line_window_is_open(w.edition_id);" 1

PAYLOAD="{\"edition_id\":\"$ED\",\"source_submission_id\":\"$SOURCE\",\"selection_type\":\"internal\",\"artist\":\"Replacement Artist\",\"song_title\":\"Replacement Song\",\"preview_start\":\"00:10\",\"preview_end\":\"00:30\"}"
COMMAND="select public.v3_submit_next_in_line('$PAYLOAD'::jsonb,'$OP'::uuid,'nline-fixture-a');"
deny "missing rollout rule" "$ACTOR" "$COMMAND" "FEATURE_UNAVAILABLE"
check_count "missing rollout no writer row" "select count(*) from public.next_in_line_submissions where edition_id='$ED';" 0
check_count "missing rollout no receipt" "select count(*) from public.studio2_operation_receipts where operation_id='$OP';" 0
sql "insert into public.studio2_feature_flags(key,enabled,admins_only,user_ids,edition_ids)
values ('next_in_line',false,false,'{}'::uuid[],'{}'::uuid[]);"
deny "disabled rollout" "$ACTOR" "$COMMAND" "FEATURE_UNAVAILABLE"
sql "update public.studio2_feature_flags set enabled=true,user_ids=array['$OTHER'::uuid] where key='next_in_line';"
deny "non-tester caller" "$ACTOR" "$COMMAND" "FEATURE_UNAVAILABLE"
sql "update public.studio2_feature_flags set user_ids=array['$ACTOR'::uuid],edition_ids=array['$ED2'::uuid] where key='next_in_line';"
deny "different rollout edition" "$ACTOR" "$COMMAND" "FEATURE_UNAVAILABLE"
sql "update public.studio2_feature_flags set edition_ids=array['$ED'::uuid] where key='next_in_line';"
role_call "$ACTOR" "$COMMAND" >/dev/null
check_count "allowed writes one canonical row" "select count(*) from public.next_in_line_submissions where edition_id='$ED' and source_submission_id='$SOURCE';" 1
role_call "$ACTOR" "$COMMAND" >/dev/null
check_count "retry does not duplicate row" "select count(*) from public.next_in_line_submissions where edition_id='$ED' and source_submission_id='$SOURCE';" 1
sql "update public.studio2_feature_flags set enabled=false where key='next_in_line';"
deny "revoked even after prior write" "$ACTOR" "$COMMAND" "FEATURE_UNAVAILABLE"
check_count "revocation preserves prior row" "select count(*) from public.next_in_line_submissions where edition_id='$ED' and source_submission_id='$SOURCE';" 1
pass "Local rollout/permission/edition/revoke/no-write contract complete"
