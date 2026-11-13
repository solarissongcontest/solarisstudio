-- OPERATOR ONLY: bounded downstream Archive/Televote/publication dependencies.
-- No application rows, raw function bodies or business-function invocations.
begin transaction read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
with wanted_tables(identity) as (values ('private.v3_televote_result_projection_sources'),
('public.televote_votes'),
('private.v3_result_versions'),
('public.studio2_show_publication_controls'),
('public.televoting_round_bindings'),
('televoting.round_influence_results')),
wanted_functions(identity) as (values ('private.v3_guard_source_managed_televote_projection()'),
('private.v3_televote_projection_snapshot(uuid)'),
('private.v3_sync_published_televote_round(uuid)'),
('private.v3_sync_published_televote_aggregation(uuid)'),
('public.studio2_televote_projection_status(uuid)'),
('televoting.v3_commit_official_round_calculation(uuid,integer,timestamptz,uuid,text,text[],jsonb,jsonb)'),
('public.v3_public_published_result_snapshot(uuid)'),
('private.v3_publication_result_version_release_ready(uuid,bigint)'),
('private.v3_capture_result_version()')),
t as (select w.identity,c.oid is not null as exists_now,c.relkind,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity as rls from wanted_tables w left join pg_class c on c.oid=to_regclass(w.identity)),
f as (select w.identity,p.oid is not null as exists_now,pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,md5(pg_get_functiondef(p.oid)) as definition_md5,p.proacl::text as acl,md5(coalesce(p.proconfig::text,'')) as settings_md5,
(select jsonb_object_agg(r,has_function_privilege(r,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) r) as execute from wanted_functions w left join pg_proc p on p.oid=to_regprocedure(w.identity))
select jsonb_build_object('schema_version',1,'project_ref','dkxmnvekiopyesuzggeu','observed_at',statement_timestamp(),'read_only',current_setting('transaction_read_only'),'tables',(select jsonb_agg(to_jsonb(t) order by identity) from t),'functions',(select jsonb_agg(to_jsonb(f) order by identity) from f)) as dependency_export;
rollback;
