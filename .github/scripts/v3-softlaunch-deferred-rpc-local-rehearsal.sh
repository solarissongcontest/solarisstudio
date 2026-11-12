#!/usr/bin/env bash
set -euo pipefail

# Exact-SHA source-defined deferred-RPC guard test: disposable local Supabase ONLY.
# There is deliberately no hosted target, auto-link or production fallback.
fail() { echo "V3 SOFT-LAUNCH LOCAL FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
[[ $# == 0 && -f supabase/config.toml ]] || fail "Not a disposable repo worktree"
for name in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOST PGHOSTADDR; do
  [[ -z "$(printenv "$name" || true)" ]] || fail "Inherited $name"
done
status="$(supabase status -o env)" || fail "Local Supabase unavailable"
eval "$status"
: "$API_URL" "$DB_URL"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Nonloopback API target";; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Nonlocal database target";; esac
[[ "$(git rev-parse HEAD)" == "$V3_EXACT_SHA" ]] || fail "Candidate SHA mismatch"

scalar() { psql "$DB_URL" -w -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }
sql() { psql "$DB_URL" -w -X -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null; }
role_call() {
  local actor="$1" query="$2"
  psql "$DB_URL" -w -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
    -c "set role authenticated; set request.jwt.claim.sub='$actor'; $query"
}
deny() {
  local label="$1" actor="$2" query="$3" expected="$4" output
  if output="$(role_call "$actor" "$query" 2>&1)"; then fail "$label unexpectedly succeeded"; fi
  [[ "$output" == *"$expected"* ]] || fail "$label wrong rejection: $output"
  pass "$label rejected"
}
eq_count() {
  local label="$1" query="$2" expected="$3" actual
  actual="$(scalar "$query")"
  [[ "$actual" == "$expected" ]] || fail "$label: expected $expected, got $actual"
  pass "$label"
}

# This candidate remains outside supabase/migrations; only execute on disposable DB.
psql "$DB_URL" -w -X -q -v ON_ERROR_STOP=1 \
  -f docs/v3/recovery-candidates/forward-only-softlaunch-deferred-rpc-rollout-local.sql >/dev/null
pass "Applied candidate locally"
for signature in 'public.submit_fantasy_team(uuid,uuid[],uuid)' 'public.submit_prediction(uuid,jsonb)'; do
  [[ "$(scalar "select has_function_privilege('anon','$signature','EXECUTE');")" == f ]] || fail "anon RPC EXECUTE leaked"
  [[ "$(scalar "select has_function_privilege('authenticated','$signature','EXECUTE');")" == t ]] || fail "authenticated RPC EXECUTE missing"
done
[[ "$(scalar "select has_function_privilege('authenticated','private.studio2_feature_enabled_for(uuid,text,uuid)','EXECUTE');")" == f ]] || fail "private authority helper externally callable"
pass "RPC ACL and private helper isolation"

USER_A='00000000-0000-4000-8000-00000000d801'
USER_B='00000000-0000-4000-8000-00000000d802'
ED_A='00000000-0000-4000-8000-00000000d811'
ED_B='00000000-0000-4000-8000-00000000d812'
SHOW_A='00000000-0000-4000-8000-00000000d821'
C1='00000000-0000-4000-8000-00000000d831'
C2='00000000-0000-4000-8000-00000000d832'
GAME='00000000-0000-4000-8000-00000000d841'
ROUND='00000000-0000-4000-8000-00000000d851'

# Reuse the same publication-control seeding contract as the established S8
# local Prediction replay rehearsal. No auth service or hosted API calls.
sql "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('$USER_A','authenticated','authenticated','rollout-a@solaris.invalid',now(),now()),
 ('$USER_B','authenticated','authenticated','rollout-b@solaris.invalid',now(),now());
insert into public.countries(id,name,short_code) values
 ('$C1','Softlaunch One','SL1'),('$C2','Softlaunch Two','SL2');
insert into public.editions(id,name,slug,edition_number,status,published) values
 ('$ED_A','Softlaunch A','softlaunch-a',9801,'active',false),
 ('$ED_B','Softlaunch B','softlaunch-b',9802,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config,qualifier_count) values
 ('$SHOW_A','$ED_A','Softlaunch Final','final',1,false,'{}'::jsonb,null);
insert into public.participants(id,edition_id,show_id,country_id,artist,song,semi_final) values
 ('00000000-0000-4000-8000-00000000d861','$ED_A','$SHOW_A','$C1','Soft Artist One','Soft Song One','final'),
 ('00000000-0000-4000-8000-00000000d862','$ED_A','$SHOW_A','$C2','Soft Artist Two','Soft Song Two','final');
update public.shows set
 publication_config=private.studio2_normalise_publication_config('{\"participants\":true}'::jsonb),
 published=true, updated_at=now() where id='$SHOW_A';
update public.studio2_show_publication_controls set state='public',version=version+1,
 frozen_config=private.studio2_normalise_publication_config('{\"participants\":true}'::jsonb),
 source_show_updated_at=(select updated_at from public.shows where id='$SHOW_A'),
 source_result_version=null,scheduled_for=null,scheduled_from_state=null,
 scheduled_by=null,scheduled_operation_id=null,last_failure=null,last_failure_at=null,updated_at=now()
 where show_id='$SHOW_A';
insert into public.fantasy_games(id,edition_id,show_id,name,opens_at,locks_at,status,roster_size,budget)
 values ('$GAME','$ED_A','$SHOW_A','Softlaunch Fantasy',now()-interval '1 hour',now()+interval '2 hours','open',2,50);
insert into public.fantasy_game_entries(game_id,country_id,cost,eligible) values
 ('$GAME','$C1',10,true),('$GAME','$C2',12,true);
insert into public.prediction_rounds(id,show_id,opens_at,locks_at,status,prediction_types,scoring_version,consensus_minimum)
 values ('$ROUND','$SHOW_A',now()-interval '1 hour',now()+interval '2 hours','open',array['winner']::text[],'v1',5);
update public.studio2_feature_flags
 set enabled=false,admins_only=false,user_ids='{}'::uuid[],edition_ids='{}'::uuid[]
 where key in ('fantasy_ssc','prediction_league');
"
eq_count 'existing feature rules' "select count(*) from public.studio2_feature_flags where key in ('fantasy_ssc','prediction_league');" 2

FANTASY="select public.submit_fantasy_team('$GAME'::uuid,array['$C1'::uuid,'$C2'::uuid],null);"
PRED="select public.submit_prediction('$ROUND'::uuid,'[{\"countryId\":\"$C1\",\"type\":\"winner\",\"rank\":null,\"confidence\":null}]'::jsonb);"

deny 'disabled Fantasy' "$USER_A" "$FANTASY" 'Fantasy is not available'
deny 'disabled Prediction' "$USER_A" "$PRED" 'Prediction League is not available'
eq_count 'disabled Fantasy no writes' "select count(*) from public.fantasy_teams where game_id='$GAME';" 0
eq_count 'disabled Prediction no writes' "select count(*) from public.prediction_entries where round_id='$ROUND';" 0

sql "delete from public.studio2_feature_flags where key in ('fantasy_ssc','prediction_league');"
deny 'missing Fantasy flag' "$USER_A" "$FANTASY" 'Fantasy is not available'
deny 'missing Prediction flag' "$USER_A" "$PRED" 'Prediction League is not available'
eq_count 'missing flags no fan profiles' "select count(*) from public.fan_profiles where id in ('$USER_A','$USER_B');" 0

sql "insert into public.studio2_feature_flags(key,enabled,admins_only,user_ids,edition_ids)
 values ('fantasy_ssc',true,false,array['$USER_A'::uuid],array['$ED_A'::uuid]),
 ('prediction_league',true,false,array['$USER_A'::uuid],array['$ED_A'::uuid]);"
deny 'non-tester Fantasy' "$USER_B" "$FANTASY" 'Fantasy is not available'
deny 'non-tester Prediction' "$USER_B" "$PRED" 'Prediction League is not available'
eq_count 'non-tester Fantasy no writes' "select count(*) from public.fantasy_teams where game_id='$GAME';" 0

sql "update public.studio2_feature_flags set edition_ids=array['$ED_B'::uuid] where key in ('fantasy_ssc','prediction_league');"
deny 'cross-edition Fantasy' "$USER_A" "$FANTASY" 'Fantasy is not available'
deny 'cross-edition Prediction' "$USER_A" "$PRED" 'Prediction League is not available'
sql "update public.studio2_feature_flags set edition_ids=array['$ED_A'::uuid] where key in ('fantasy_ssc','prediction_league');"

role_call "$USER_A" "$FANTASY" >/dev/null
role_call "$USER_A" "$PRED" >/dev/null
eq_count 'authorized Fantasy team' "select count(*) from public.fantasy_teams where game_id='$GAME' and profile_id='$USER_A';" 1
eq_count 'authorized Fantasy roster' "select count(*) from public.fantasy_team_entries where team_id=(select id from public.fantasy_teams where game_id='$GAME' and profile_id='$USER_A');" 2
eq_count 'authorized Prediction version' "select count(*) from public.prediction_entry_versions where entry_id=(select id from public.prediction_entries where round_id='$ROUND' and profile_id='$USER_A');" 1

role_call "$USER_A" "$FANTASY" >/dev/null
role_call "$USER_A" "$PRED" >/dev/null
eq_count 'Fantasy retry no duplicated roster' "select count(*) from public.fantasy_team_entries where team_id=(select id from public.fantasy_teams where game_id='$GAME' and profile_id='$USER_A');" 2
eq_count 'Prediction replay unchanged version' "select version from public.prediction_entries where round_id='$ROUND' and profile_id='$USER_A';" 1

sql "update public.studio2_feature_flags set enabled=false where key in ('fantasy_ssc','prediction_league');"
deny 'revoked Fantasy' "$USER_A" "$FANTASY" 'Fantasy is not available'
deny 'revoked Prediction' "$USER_A" "$PRED" 'Prediction League is not available'
eq_count 'revoked Fantasy team unchanged' "select count(*) from public.fantasy_teams where game_id='$GAME' and profile_id='$USER_A';" 1
eq_count 'revoked Fantasy entries unchanged' "select count(*) from public.fantasy_team_entries where team_id=(select id from public.fantasy_teams where game_id='$GAME' and profile_id='$USER_A');" 2
eq_count 'revoked Prediction immutable history unchanged' "select count(*) from public.prediction_entry_versions where entry_id=(select id from public.prediction_entries where round_id='$ROUND' and profile_id='$USER_A');" 1

pass 'All isolated actor/edition/rollout/no-write proofs passed'
