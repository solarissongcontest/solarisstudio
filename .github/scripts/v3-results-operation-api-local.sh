# Actual authenticated PostgreSQL sessions in a disposable recovered clone.
# Synthetic reference permissions/data only; no production/runtime equivalence claim.
set -euo pipefail
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]]
operator_sql -c 'create database results_operation_api_probe owner postgres template recovery_operator_baseline;'
result_owner_sql() { docker exec -i "$cid" psql -X -U postgres -d results_operation_api_probe -qAt -v ON_ERROR_STOP=1 "$@"; }
result_client_sql() { docker exec -i "$cid" psql -X -U authenticator -d results_operation_api_probe -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose "$@"; }
result_auth_sql() { docker exec -i "$cid" psql -X -U supabase_auth_admin -d results_operation_api_probe -qAt -v ON_ERROR_STOP=1 "$@"; }
node --input-type=module > /tmp/results-reference-permissions.sql <<'JS'
import fs from 'node:fs';
const s=fs.readFileSync('supabase/migrations/20260914035152_permission_engine_v2_foundation.sql','utf8');
for(const table of ['studio2_capabilities','studio2_access_roles']){
 const a=s.indexOf('insert into public.'+table);if(a<0)throw Error('Missing canonical permission reference');
 console.log(s.slice(a,s.indexOf(';',a)+1));
}
JS
result_owner_sql -f - < /tmp/results-reference-permissions.sql
result_auth_sql -f - <<'SQL'
insert into auth.users(id,aud,role,email)values
 ('61000000-0000-4000-8000-000000000001','authenticated','authenticated','results-operator@local.invalid');
SQL
result_owner_sql -f - <<'SQL'
insert into public.studio2_platform_operational_state(singleton,mode,version,reason)
 values(true,'normal',1,'Synthetic Results API acceptance only');
insert into public.countries(id,name,short_code)values
 ('61000000-0000-4000-8000-000000000002','Results API fixture','RAP');
insert into public.editions(id,name,year,slug,edition_number,status,published)values
 ('61000000-0000-4000-8000-000000000003','Results API fixture',2026,'results-api-fixture',9911,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published)values
 ('61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000003','Results API show','grand-final',1,false);
insert into public.participants(edition_id,show_id,country_id,participation_status)values
 ('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002','confirmed');
insert into public.studio2_capability_grants(user_id,capability,edition_id)values
 ('61000000-0000-4000-8000-000000000001','results.verify','61000000-0000-4000-8000-000000000003');
insert into public.results(edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank)
 values('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002',0,0,0,1)
 on conflict (show_id,country_id) where show_id is not null do update
 set jury_points=0,televote_points=0,total_points=0,final_rank=1;
-- Prepare a synthetic, unpublished reveal-ready version for a legitimate
-- Organizer clear operation. No synthetic submission is made to hosted Auth.
update public.studio2_result_operations set calculation_version=1,last_calculated_at=now(),
 reviewed_version=1,locked_version=1,reveal_ready_version=1
 where show_id='61000000-0000-4000-8000-000000000004';
SQL
result_client_sql -f - <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000001"}';
do $test$
declare p jsonb;r jsonb;retry jsonb;
begin
 p:=public.studio2_result_operation_preview_v2('61000000-0000-4000-8000-000000000004','clear_reveal_ready');
 r:=public.studio2_execute_result_operation_v2('61000000-0000-4000-8000-000000000004','clear_reveal_ready','Authenticated release-gate correction',
 '61000000-0000-4000-8000-000000000005',(p->>'calculationVersion')::bigint,(p->>'reviewBasisVersion')::bigint,
 '61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001');
 retry:=public.studio2_execute_result_operation_v2('61000000-0000-4000-8000-000000000004','clear_reveal_ready','Authenticated release-gate correction',
 '61000000-0000-4000-8000-000000000005',(p->>'calculationVersion')::bigint,(p->>'reviewBasisVersion')::bigint,
 '61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001');
 if r->>'executionId' is distinct from '61000000-0000-4000-8000-000000000005'
  or (retry->>'idempotentReplay')::boolean is distinct from true
  or retry->>'executionId' is distinct from r->>'executionId' then
  raise exception 'Authenticated governed Results command/replay failed';end if;
end $test$;
commit;
SQL
[[ "$(result_owner_sql -c "select count(*) from public.studio2_result_operation_executions where execution_id='61000000-0000-4000-8000-000000000005' and actor_user_id='61000000-0000-4000-8000-000000000001';")" == 1 ]]
basis_before="$(result_owner_sql -c "select review_basis_version from public.studio2_result_operations where show_id='61000000-0000-4000-8000-000000000004';")"
[[ "$basis_before" =~ ^[0-9]+$ ]]
frozen_before="$(result_owner_sql -c "select md5(result_rows::text) from private.v3_result_versions where show_id='61000000-0000-4000-8000-000000000004' and version=1;")"
result_client_sql -f - > /tmp/results-concurrent-command.log 2>&1 <<SQL &
begin;
set local application_name='solaris_results_cas_lock_probe';
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000001"}';
select public.studio2_execute_result_operation_v2('61000000-0000-4000-8000-000000000004','mark_reveal_ready','Authenticated reveal-ready operation',
 '61000000-0000-4000-8000-000000000006',1,$basis_before,
 '61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001');
\echo RESULTS_LOCK_HELD
select pg_sleep(4);
commit;
SQL
result_lock_pid=$!
lock_observed=false
for n in $(seq 1 60);do
 if [[ "$(docker exec "$cid" psql -X -U solaris_recovery_bootstrap -d results_operation_api_probe -Atqc "select count(*) from pg_stat_activity where application_name='solaris_results_cas_lock_probe' and wait_event='PgSleep' and backend_xid is not null;")" == 1 ]];then lock_observed=true;break;fi
 sleep 0.05
done
[[ "$lock_observed" == true ]] || { cat /tmp/results-concurrent-command.log;exit 1; }
if result_owner_sql -c "set lock_timeout='250ms';update public.participants set participation_status='withdrawn' where show_id='61000000-0000-4000-8000-000000000004';" > /tmp/results-concurrent-input.log 2>&1;then
 echo 'Concurrent canonical input unexpectedly overwrote a locked Results review';exit 1
fi
grep -Eq 'RESULTS_REVIEW_BASIS_BUSY|lock timeout' /tmp/results-concurrent-input.log
wait "$result_lock_pid"
[[ "$(result_owner_sql -c "select participation_status from public.participants where show_id='61000000-0000-4000-8000-000000000004';")" == confirmed ]]
result_owner_sql -c "update public.participants set participation_status='withdrawn' where show_id='61000000-0000-4000-8000-000000000004';"
[[ "$(result_owner_sql -c "select (review_basis_version>$basis_before and reviewed_version is null and locked_version is null and reveal_ready_version is null)::text from public.studio2_result_operations where show_id='61000000-0000-4000-8000-000000000004';")" == true ]]
[[ "$(result_owner_sql -c "select md5(result_rows::text) from private.v3_result_versions where show_id='61000000-0000-4000-8000-000000000004' and version=1;")" == "$frozen_before" ]]
result_client_sql -f - <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000001"}';
do \$test\$
declare r jsonb;denied boolean:=false;
begin
 begin
  perform public.studio2_execute_result_operation_v2('61000000-0000-4000-8000-000000000004','mark_reveal_ready','Stale review must not be accepted',
   '61000000-0000-4000-8000-000000000007',1,$basis_before,
   '61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001');
 exception when sqlstate 'PT409' then denied:=true;end;
 if not denied then raise exception 'Stale authenticated reviewed input accepted';end if;
 r:=public.studio2_execute_result_operation_v2('61000000-0000-4000-8000-000000000004','clear_reveal_ready','Authenticated release-gate correction',
  '61000000-0000-4000-8000-000000000005',1,$basis_before,
  '61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001');
 if (r->>'idempotentReplay')::boolean is distinct from true then raise exception 'Committed receipt lost after later input drift';end if;
end \$test\$;
rollback;
SQL
[[ "$(result_owner_sql -c "select count(*) from public.studio2_result_operation_executions where show_id='61000000-0000-4000-8000-000000000004';")" == 2 ]]
operator_sql -c 'drop database results_operation_api_probe;'
echo 'PASS: actual authenticated Results commands, durable replay after drift, concurrent input rollback/retry, stale denial and immutable history'
