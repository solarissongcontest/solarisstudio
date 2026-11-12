\set ON_ERROR_STOP on
-- LOCAL ONLY: names, fingerprints, effective grants and dependencies; no row
-- contents or routine bodies leave the database. Conservative graph, not a
-- complete PL/pgSQL parser. Runtime calls supplement source/catalog edges.
with funcs as (
 select p.*,n.nspname,n.nspname||'.'||p.proname as name,
 n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as identity
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('auth','private','public','televoting','extensions') and p.prokind='f'
), rels as (
 select c.*,n.nspname,n.nspname||'.'||c.relname as identity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('auth','private','public','televoting') and c.relkind in ('r','p','v','m')
), refs as (
 select f.oid,lower(m[1]||'.'||m[2]) as target from funcs f
 cross join lateral regexp_matches(f.prosrc,
 '(auth|private|public|televoting|extensions)[[:space:]]*\.[[:space:]]*([a-zA-Z_][a-zA-Z_0-9]*)','g') m
), edges as (
 select 'f:'||a.oid as source,'f:'||b.oid as target,'qualified-reference' as kind from refs a join funcs b on b.name=a.target
 union select 'f:'||a.oid,'r:'||b.identity,'qualified-reference' from refs a join rels b on b.identity=a.target
 union select 'f:'||a.oid,'f:'||b.oid,'pg_depend' from pg_depend d
 join funcs a on d.classid='pg_proc'::regclass and a.oid=d.objid
 join funcs b on d.refclassid='pg_proc'::regclass and b.oid=d.refobjid
 union select 'r:'||r.identity,'f:'||f.oid,'policy-expression' from pg_policy pol
 join rels r on r.oid=pol.polrelid join pg_depend d on d.classid='pg_policy'::regclass and d.objid=pol.oid
 join funcs f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
 union select 'r:'||r.identity,'f:'||f.oid,'constraint-expression' from pg_constraint con
 join rels r on r.oid=con.conrelid join pg_depend d on d.classid='pg_constraint'::regclass and d.objid=con.oid
 join funcs f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
 union select 'r:'||r.identity,'f:'||f.oid,'column-expression' from pg_attrdef a
 join rels r on r.oid=a.adrelid join pg_depend d on d.classid='pg_attrdef'::regclass and d.objid=a.oid
 join funcs f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
 union select 'r:'||r.identity,'f:'||f.oid,'index-expression' from pg_index ix
 join rels r on r.oid=ix.indrelid join pg_depend d on d.classid='pg_class'::regclass and d.objid=ix.indexrelid
 join funcs f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
 union select 'r:'||r.identity,'f:'||f.oid,'view-expression' from pg_rewrite rw
 join rels r on r.oid=rw.ev_class join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=rw.oid
 join funcs f on d.refclassid='pg_proc'::regclass and d.refobjid=f.oid
 union select 'r:'||r.identity,'r:'||target.identity,'view-relation' from pg_rewrite rw
 join rels r on r.oid=rw.ev_class join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=rw.oid
 join rels target on d.refclassid='pg_class'::regclass and d.refobjid=target.oid
 union select 'r:'||a.identity,'r:'||b.identity,'foreign-key' from pg_constraint con
 join rels a on a.oid=con.conrelid join rels b on b.oid=con.confrelid where con.contype='f'
 union select 'r:'||r.identity,'t:'||r.identity||'.'||t.tgname,'trigger'
 from pg_trigger t join rels r on r.oid=t.tgrelid where not t.tgisinternal
 union select 't:'||r.identity||'.'||t.tgname,'f:'||f.oid,'trigger-function'
 from pg_trigger t join rels r on r.oid=t.tgrelid join funcs f on f.oid=t.tgfoid where not t.tgisinternal
), nodes as (
 select jsonb_build_object('id','f:'||f.oid,'kind','function','identity',f.identity,'name',f.name,'schema',f.nspname,
 'owner',pg_get_userbyid(f.proowner),'securityDefiner',f.prosecdef,'language',(select lanname from pg_language where oid=f.prolang),
 'definitionSha256',encode(extensions.digest(convert_to(pg_get_functiondef(f.oid),'UTF8'),'sha256'),'hex'),
 'bodyMd5',md5(f.prosrc),'settingsMd5',md5(coalesce(f.proconfig::text,'')),'aclMd5',md5(coalesce(f.proacl::text,'')),
 'dynamicSql',f.prosrc ~* '\mexecute\M','runtimeCalls',coalesce((select calls from pg_stat_user_functions s where s.funcid=f.oid),0),
 'privileges',(select jsonb_object_agg(role,has_function_privilege(role,f.oid,'EXECUTE'))
 from unnest(array['anon','authenticated','service_role']) role)) as value from funcs f
 union all select jsonb_build_object('id','r:'||r.identity,'kind','relation','identity',r.identity,'schema',r.nspname,
 'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,
 'columnUpdates',(select jsonb_object_agg(role||':'||a.attname,has_column_privilege(role,r.oid,a.attnum,'UPDATE'))
 from pg_attribute a,unnest(array['anon','authenticated','service_role']) role where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
 'privileges',(select jsonb_object_agg(role||':'||right_name,has_table_privilege(role,r.oid,right_name))
 from unnest(array['anon','authenticated','service_role']) role,unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) right_name)) from rels r
 union all select jsonb_build_object('id','t:'||r.identity||'.'||t.tgname,'kind','trigger',
 'identity',r.identity||'.'||t.tgname,'schema',r.nspname,'enabled',t.tgenabled,'definitionMd5',md5(pg_get_triggerdef(t.oid)))
 from pg_trigger t join rels r on r.oid=t.tgrelid where not t.tgisinternal
)
select jsonb_build_object('formatVersion',1,'serverVersionNum',current_setting('server_version_num')::integer,
 'trackFunctions',current_setting('track_functions'),'databaseIdentity',current_database()||':'||pg_postmaster_start_time()::text,
 'migrationVersions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'seedCounts',jsonb_build_object('users',(select count(*) from auth.users),'ballots',(select count(*) from televoting.vote_submissions)),
 'nodes',(select jsonb_agg(value order by value->>'id') from nodes),
 'edges',(select jsonb_agg(to_jsonb(e) order by source,target,kind) from edges e),
 'schemas',(select jsonb_agg(jsonb_build_object('identity',n.nspname,'owner',pg_get_userbyid(n.nspowner),
 'privileges',(select jsonb_object_agg(role||':'||right_name,has_schema_privilege(role,n.oid,right_name))
 from unnest(array['anon','authenticated','service_role']) role,unnest(array['USAGE','CREATE']) right_name)))
 from pg_namespace n where n.nspname in ('auth','private','public','televoting','extensions')),
 'roleMemberships',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',m.rolname,'inherit',am.inherit_option)),'[]'::jsonb)
 from pg_auth_members am join pg_roles r on r.oid=am.roleid join pg_roles m on m.oid=am.member
 where r.rolname in ('anon','authenticated','service_role') or m.rolname in ('anon','authenticated','service_role')));
