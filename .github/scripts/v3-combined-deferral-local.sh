# Sourced after the original ordered recovery; networkless local fixture only.
set -euo pipefail
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]]
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]]
# Synthetic historical evidence exists BEFORE applying the cutover; do not
# disable a trigger, forge provenance or rewrite any existing contest records.
operator_sql -c "insert into televoting.televote_aggregations(id,name)values('53000000-0000-4000-8000-000000000001','Historical Combined fixture');insert into televoting.televote_aggregation_sources(id,aggregation_id,source_name)values('53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001','Historical source');insert into televoting.external_score_entries(source_id,country_code,value)values('53000000-0000-4000-8000-000000000002','SR11',42);insert into televoting.combined_televote_results(aggregation_id,country_code,final_combined_points)values('53000000-0000-4000-8000-000000000001','SR11',42);"
# Snapshot pre-existing trigger identities/definitions/state, table rows and
# SELECT privileges. The new restriction must not change any of these.
combined_preserved() {
 operator_sql -c "select jsonb_build_object('triggers',(select jsonb_agg(jsonb_build_array(c.oid::regclass::text,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid))order by c.oid::regclass::text,t.tgname)from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname not in('v3_deny_deferred_combined_write','v3_deny_deferred_combined_projection')),'history',(select jsonb_agg(to_jsonb(r)order by r.id)from televoting.combined_televote_results r),'reads',(select jsonb_agg(jsonb_build_array(c.relname,r,has_table_privilege(r,c.oid,'SELECT'))order by c.relname,r)from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['anon','authenticated','service_role'])r where n.nspname='televoting' and c.relname in('televote_aggregations','televote_aggregation_participants','televote_aggregation_sources','external_score_entries','external_score_entry_log','combined_televote_results','combined_televote_component_results')))::text;"
}
combined_before="$(combined_preserved)"
operator_sql -c 'alter function private.v3_sync_published_televote_aggregation(uuid) set search_path=pg_catalog;'
combined_drift="$(operator_state_digest)"
if operator_sql -f - < supabase/migrations/20261114141934_v3_defer_combined_televote_database_writes.sql > /tmp/combined-preflight-denial.log 2>&1;then exit 1;fi
grep -Fq 'Combined source adapter definition/owner drift or missing prerequisite' /tmp/combined-preflight-denial.log
[[ "$(operator_state_digest)" == "$combined_drift" ]] || exit 1
operator_sql -c 'alter function private.v3_sync_published_televote_aggregation(uuid) set search_path=pg_catalog,public,private,televoting;'
operator_apply supabase/migrations/20261114141934_v3_defer_combined_televote_database_writes.sql
[[ "$(combined_preserved)" == "$combined_before" ]] || { echo 'Combined cutover changed historical evidence, SELECT or pre-existing guards';exit 1; }
docker exec -i "$cid" psql -X -U authenticator -d recovery_operator_baseline -qAt -v ON_ERROR_STOP=1 -f - < .github/tests/v3-combined-deferral-runtime.sql
operator_sql -f - < .github/tests/v3-combined-deferral-owner.sql
operator_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
operator_sql -f - < .github/tests/v3-result-authority-recovery.sql
operator_sql -f - < .github/tests/v3-voting-config-authority.sql
[[ "$(combined_preserved)" == "$combined_before" ]] || exit 1
echo 'PASS: deferred Combined API/owner DML and sync denied; historical rows/guards/SELECT, ordinary Results/snapshots preserved'
