begin read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
with targets(identity) as (values
 ('private.studio2_user_access_allowed(uuid,text,uuid,boolean)'),
 ('private.studio2_can_preview_results(uuid,uuid)'),
 ('private.studio2_can_verify_results(uuid,uuid)'),
 ('private.studio2_result_preconditions(uuid)'),
 ('private.studio2_result_preconditions_v3_base(uuid)'),
 ('public.studio2_execute_result_operation(uuid,text,text,uuid,bigint)'),
 ('public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint)'),
 ('public.studio2_results_operations_snapshot(uuid)'),
 ('public.materialize_show_results_if_missing(uuid)'),
 ('public.recalculate_show_results_internal(uuid)'),
 ('televoting.integrity_sanction_matches(text,uuid,text,text,uuid,text,text)')
), routines as (
 select jsonb_build_object('identity',t.identity,'exists',p.oid is not null,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'language',l.lanname,'config',p.proconfig,'acl',p.proacl::text,'definition_sha256',case when p.oid is not null then encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')end,'body_md5',md5(p.prosrc),'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'leakproof',p.proleakproof,'execute',case when p.oid is not null then jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))end) item
 from targets t left join pg_proc p on p.oid=to_regprocedure(t.identity) left join pg_language l on l.oid=p.prolang
), tables as (
 select jsonb_build_object('identity',t.identity,'exists',c.oid is not null,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,'columns_md5',(select md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text,','order by a.attnum))from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))item
 from (values('public.studio2_result_operations'),('public.studio2_result_operation_executions'))t(identity)left join pg_class c on c.oid=to_regclass(t.identity)
)
select jsonb_build_object('projectRef','dkxmnvekiopyesuzggeu','observedAt',transaction_timestamp(),'database',current_database(),'server_version_num',current_setting('server_version_num'),'read_only',current_setting('transaction_read_only'),'applicationRowsRead',false,'rawFunctionBodiesExported',false,'routines',(select jsonb_agg(item order by item->>'identity')from routines),'tables',(select jsonb_agg(item order by item->>'identity')from tables)) as evidence;
rollback;
