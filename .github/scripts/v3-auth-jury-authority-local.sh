# Sourced by the existing networkless recovered PG17.11 fixture driver.
set -euo pipefail
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]]
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]]
node scripts/stage-v3-signup-jury-prerequisites-local.mjs > /tmp/signup-jury-prerequisites.sql
operator_sql -f - < /tmp/signup-jury-prerequisites.sql
# Auth-owned trigger installation is fixture reconstruction by the LOCAL cluster
# bootstrap, NOT proposed production DDL by the nonsuperuser recovery operator.
bootstrap_sql -c 'create trigger on_solaris_country_signup after insert on auth.users for each row execute function public.claim_country_from_signup();'
operator_apply supabase/migrations/20261114102706_v3_jury_governed_submission_cutover.sql
operator_sql -c 'create database security_jury_probe owner postgres template recovery_operator_baseline;'
security_sql() { docker exec -i "$cid" psql -X -U postgres -d security_jury_probe -qAt -v ON_ERROR_STOP=1 "$@"; }
auth_sql() { docker exec -i "$cid" psql -X -U supabase_auth_admin -d security_jury_probe -qAt -v ON_ERROR_STOP=1 "$@"; }
client_sql() { docker exec -i "$cid" psql -X -U authenticator -d security_jury_probe -qAt -v ON_ERROR_STOP=1 "$@"; }
# Source-defined reference DATA, not invented permissive function stubs or
# evidence that actual hosted configuration equals these synthetic defaults.
node --input-type=module > /tmp/security-reference-fixture.sql <<'JS'
import fs from 'node:fs';const s=fs.readFileSync('supabase/migrations/20260914035152_permission_engine_v2_foundation.sql','utf8');for(const table of ['studio2_capabilities','studio2_access_roles']){const a=s.indexOf('insert into public.'+table);if(a<0)throw Error('Missing canonical reference seed: '+table);console.log(s.slice(a,s.indexOf(';',a)+1));}
JS
security_sql -f - < /tmp/security-reference-fixture.sql
security_sql -c "insert into public.studio2_platform_operational_state(singleton,mode,version,reason)values(true,'normal',1,'Synthetic acceptance only; production unchanged');"
auth_sql -f - <<'SQL'
insert into auth.users(id,aud,role,email,raw_user_meta_data)values('52000000-0000-4000-8000-000000000001','authenticated','authenticated','security-signup@local.invalid','{"account_type":"country","country_id":"51000000-0000-4000-8000-000000000011","instagram_username":"@Mixed.Name","display_name":" Test Claim ","roles":["organizer"]}');
SQL
[[ "$(security_sql -c "select ((select count(*)=1 from public.country_accounts where user_id='52000000-0000-4000-8000-000000000001' and country_id='51000000-0000-4000-8000-000000000011' and instagram_username='mixed.name' and display_name='Test Claim') and not exists(select 1 from public.studio2_role_assignments where user_id='52000000-0000-4000-8000-000000000001' and role_key<>'hod'))::text")" == true ]]
# Two independent Auth-owner connections race for one country. The loser must
# roll back its entire auth.users insertion; no application compensation needed.
auth_sql -f - > /tmp/signup-winner.log 2>&1 <<'SQL' &
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data)values('52000000-0000-4000-8000-000000000002','authenticated','authenticated','security-race-winner@local.invalid','{"account_type":"country","country_id":"51000000-0000-4000-8000-000000000014","instagram_username":"race.winner","display_name":"Race Winner"}');
\echo CLAIM_READY
select pg_sleep(1);
commit;
SQL
signup_winner_pid=$!
for n in $(seq 1 60); do if grep -Fq CLAIM_READY /tmp/signup-winner.log;then break;fi;sleep 0.1;done
grep -Fq CLAIM_READY /tmp/signup-winner.log
if auth_sql -c "insert into auth.users(id,raw_user_meta_data)values('52000000-0000-4000-8000-000000000003','{\"account_type\":\"country\",\"country_id\":\"51000000-0000-4000-8000-000000000014\",\"instagram_username\":\"race.loser\",\"display_name\":\"Race Loser\"}');" > /tmp/signup-loser.log 2>&1; then exit 1;fi
wait "$signup_winner_pid"
grep -Fq 'already has an account' /tmp/signup-loser.log
[[ "$(security_sql -c "select (exists(select 1 from auth.users where id='52000000-0000-4000-8000-000000000002') and not exists(select 1 from auth.users where id='52000000-0000-4000-8000-000000000003'))::text")" == true ]]
if auth_sql -c "insert into auth.users(id,raw_user_meta_data)values('52000000-0000-4000-8000-000000000004','{\"account_type\":\"country\",\"country_id\":\"51000000-0000-4000-8000-000000000015\",\"instagram_username\":\"race.winner\",\"display_name\":\"Duplicate Name\"}');" > /tmp/signup-duplicate.log 2>&1;then exit 1;fi
grep -Fq 'Instagram username already' /tmp/signup-duplicate.log
[[ "$(security_sql -c "select not exists(select 1 from auth.users where id='52000000-0000-4000-8000-000000000004')")" == t ]]
security_sql -f - < .github/tests/v3-jury-governed-cutover-setup.sql
client_sql -f - < .github/tests/v3-jury-governed-cutover-runtime.sql
[[ "$(security_sql -c "select count(*) from private.v3_jury_operations where user_id='52000000-0000-4000-8000-000000000001'")" == 1 ]]
operator_sql -c 'drop database security_jury_probe;'
echo 'PASS: Auth-owner atomic signup race/rollback; real API legacy denial, V3 ballot/replay, scope and secrecy'
