-- Operator-only one-SELECT PostgreSQL system-catalog verification.
-- Target `dkxmnvekiopyesuzggeu` outside SQL. Never run from CI/Playwright.
-- Mirrors the guarded 14-identity + helper preflight in
-- docs/v3/recovery-candidates/forward-only-s13-foundation.sql.
-- NO writes, application rows, credentials, or function-body output.
with targets(kind,schema_name,object_name) as (values
 ('table','private','v3_migration_contracts'),
 ('table','private','v3_schema_compatibility'),
 ('table','private','v3_schema_compatibility_history'),
 ('table','private','v3_backfill_jobs'),
 ('table','private','v3_migration_parity_runs'),
 ('function','public','v3_schema_compatibility'),
 ('function','public','v3_register_migration_contract'),
 ('function','public','v3_claim_backfill'),
 ('function','public','v3_checkpoint_backfill'),
 ('function','public','v3_fail_backfill'),
 ('function','public','v3_record_migration_parity'),
 ('function','public','v3_set_schema_compatibility'),
 ('index','private','v3_migration_parity_runs_key_time_idx'),
 ('index','private','v3_backfill_jobs_status_idx')
), found as (
 select kind,schema_name||'.'||object_name as identity,
 case when kind in ('table','index')
  then to_regclass(format('%I.%I',schema_name,object_name)) is not null
  else exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname=schema_name and p.proname=object_name)
 end as exists_now from targets)
select statement_timestamp() as observed_at,current_user as actor,
current_setting('server_version_num') as postgres_version_num,
to_regnamespace('private') is not null as private_schema_present,
has_schema_privilege('service_role','private','USAGE') as service_role_private_usage,
(select pg_get_userbyid(p.proowner) from pg_proc p
 where p.oid=to_regprocedure('private.studio2_request_is_service_role()')) as helper_owner,
(select md5(pg_get_functiondef(p.oid)) from pg_proc p
 where p.oid=to_regprocedure('private.studio2_request_is_service_role()')) as helper_definition_md5,
(select md5(coalesce(array_to_string(p.proacl::text[],','),'')) from pg_proc p
 where p.oid=to_regprocedure('private.studio2_request_is_service_role()')) as helper_acl_md5,
(select count(*) from found) as checked_targets,
(select count(*) from found where exists_now) as collisions,
(select coalesce(jsonb_agg(jsonb_build_object('type',kind,'identity',identity) order by identity),'[]'::jsonb) from found where exists_now) as collision_details,
(select count(*) from supabase_migrations.schema_migrations) as migration_count,
(select max(version)::text from supabase_migrations.schema_migrations) as migration_tip;
