-- Solaris Studio S13–S16 operator PRE-FLIGHT, READ-ONLY. No migration is executed.
-- Only project dkxmnvekiopyesuzggeu; run manually, never from CI/Playwright.
select current_setting('server_version') as pg_version,
 (select count(*) from supabase_migrations.schema_migrations) as migration_count,
 (select max(version) from supabase_migrations.schema_migrations) as migration_tip,
 (select mode from public.studio2_platform_operational_state where singleton is true limit 1) as mode,
 (select count(*) from storage.objects) as storage_object_records,
 to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null as s13_present,
 to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is not null as confirmation_present,
 to_regprocedure('private.v3_guard_source_managed_televote_projection()') is not null as s08_guard_present,
 to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)') is not null as results_v2_present,
 to_regprocedure('public.studio2_publish_due_show_publications()') is not null as publication_present;

-- After separately approved S16 closure, all 42 actor/relation pairs must deny TRUNCATE.
with t(name) as (select unnest(array[
'public.country_accounts','public.editions','public.entries','public.edit_tokens',
'public.jury_votes','public.results','public.shows','public.studio2_result_operations',
'public.studio2_show_publication_controls','public.studio2_upload_authorizations',
'public.submissions','public.televote_votes','televoting.televote_aggregations',
'televoting.vote_submissions'])),
 roles(name) as (select unnest(array['anon','authenticated','service_role']))
select t.name as relation,roles.name as actor,
 to_regclass(t.name) is not null as table_exists,
 case when to_regclass(t.name) is not null then has_table_privilege(roles.name,t.name,'TRUNCATE') end as allows_truncate,
 case when to_regclass(t.name) is not null then
  (select c.relrowsecurity from pg_class c where c.oid=to_regclass(t.name)) end as rls_enabled
from t cross join roles order by 1,2;

-- After governed commands are installed, five tables must have zero competing direct API writers.
with t(name) as (select unnest(array[
'public.results','public.submissions','public.edit_tokens',
'public.studio2_show_publication_controls','public.studio2_show_publication_executions'])),
 roles(name) as (select unnest(array['anon','authenticated','service_role']))
select t.name as relation,roles.name as actor,
 case when to_regclass(t.name) is not null then
   has_table_privilege(roles.name,t.name,'INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,MAINTAIN') end as direct_table_write,
 case when to_regclass(t.name) is not null then
   has_any_column_privilege(roles.name,t.name,'INSERT,UPDATE') end as direct_column_write
from t cross join roles order by 1,2;

-- These are 19-Nov CURRENT catalog fingerprints, not 15-Nov backup hashes.
with t as (
 select n.nspname||'.'||c.relname as relation,pg_get_userbyid(c.relowner) as owner,
 c.relrowsecurity as rls,coalesce(array_to_string(c.relacl,','),'') as acl
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname||'.'||c.relname = any(array[
'public.country_accounts','public.editions','public.entries','public.edit_tokens',
'public.jury_votes','public.results','public.shows','public.studio2_result_operations',
'public.studio2_show_publication_controls','public.studio2_upload_authorizations',
'public.submissions','public.televote_votes','televoting.televote_aggregations',
'televoting.vote_submissions']))
select count(*) as launch_tables,
 md5(string_agg(relation||'|'||owner||'|'||rls||'|'||acl,chr(10) order by relation)) as owner_rls_acl_fingerprint
from t;
