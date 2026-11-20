-- Catalog metadata only. No application rows, business RPCs, secret settings or raw bodies.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TimeZone = 'UTC';
SET LOCAL standard_conforming_strings = on;
WITH
scope AS (SELECT unnest(ARRAY['auth','private','public','storage','televoting']) AS name),
ns AS (SELECT n.* FROM pg_namespace n JOIN scope s ON s.name=n.nspname),
rels AS (SELECT c.*, n.nspname FROM pg_class c JOIN ns n ON n.oid=c.relnamespace
         WHERE c.relkind IN ('r','p','v','m','f','S')),
-- Resolve role names, not cluster-local OIDs. NULL ACL means PostgreSQL's default ACL.
acl_inputs AS (
 SELECT 'relation' AS kind, format('%I.%I',nspname,relname) AS identity,
        coalesce(relacl,acldefault(CASE WHEN relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,relowner)) AS acl FROM rels
 UNION ALL SELECT 'schema',quote_ident(nspname),coalesce(nspacl,acldefault('n',nspowner)) FROM ns
 UNION ALL SELECT 'column',format('%I.%I.%I',c.nspname,c.relname,a.attname),a.attacl
 FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
 UNION ALL SELECT 'default',format('%I.%I:%s',pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'<global>'),d.defaclobjtype),d.defaclacl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclnamespace=0 OR n.nspname IN (SELECT name FROM scope)
),
acls AS (
 SELECT i.kind,i.identity,coalesce(jsonb_agg(jsonb_build_object(
   'grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
   'privilege',x.privilege_type,'grantable',x.is_grantable)
   ORDER BY x.grantor::regrole::text,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable)
   FILTER(WHERE x.privilege_type IS NOT NULL),'[]'::jsonb) AS grants
 FROM acl_inputs i LEFT JOIN LATERAL aclexplode(i.acl) x ON true GROUP BY i.kind,i.identity
),
configs AS (
 SELECT coalesce(r.rolname,'<all>') AS role,CASE WHEN s.setdatabase=0 THEN '<all>' ELSE d.datname END AS database,
 split_part(v,'=',1) AS name,
 CASE WHEN split_part(v,'=',1) IN ('search_path','statement_timeout','lock_timeout','idle_in_transaction_session_timeout',
 'row_security','default_transaction_read_only','default_transaction_isolation','session_replication_role',
 'app.settings.jwt_exp','pgrst.db_max_rows','pgrst.db_pre_request','pgrst.db_schemas','session_preload_libraries','log_statement')
 THEN substring(v FROM position('=' IN v)+1) ELSE NULL END AS value
 FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole LEFT JOIN pg_database d ON d.oid=s.setdatabase
 CROSS JOIN LATERAL unnest(s.setconfig) v WHERE s.setdatabase IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))
),
sections AS (SELECT
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',format('%I.%I',nspname,relname),'kind',relkind,
 'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,
 'raw_acl',relacl::text,'grants',(SELECT grants FROM acls WHERE kind='relation' AND identity=format('%I.%I',c.nspname,c.relname)))
 ORDER BY nspname,relname),'[]'::jsonb) FROM rels c) AS relations,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',quote_ident(nspname),'owner',pg_get_userbyid(nspowner),
 'grants',(SELECT grants FROM acls WHERE kind='schema' AND identity=quote_ident(nspname))) ORDER BY nspname),'[]'::jsonb) FROM ns) AS schemas,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',format('%I.%I.%I',c.nspname,c.relname,a.attname),
 'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
 'grants',coalesce((SELECT grants FROM acls WHERE kind='column' AND identity=format('%I.%I.%I',c.nspname,c.relname,a.attname)),'[]'::jsonb))
 ORDER BY c.nspname,c.relname,a.attname),'[]'::jsonb) FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',format('%I.%I:%I',n.nspname,c.relname,p.polname),
 'command',p.polcmd,'permissive',p.polpermissive,
 'roles',(SELECT jsonb_agg(CASE WHEN u=0 THEN 'PUBLIC' ELSE pg_get_userbyid(u) END ORDER BY CASE WHEN u=0 THEN 'PUBLIC' ELSE pg_get_userbyid(u) END) FROM unnest(p.polroles) u),
 'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid)))
 ORDER BY n.nspname,c.relname,p.polname),'[]'::jsonb)
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN ns n ON n.oid=c.relnamespace) AS policies,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',identity,'grants',grants) ORDER BY identity),'[]'::jsonb) FROM acls WHERE kind='default') AS default_acls,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',rolname,'superuser',rolsuper,'inherit',rolinherit,
 'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,
 'bypass_rls',rolbypassrls,'connection_limit',rolconnlimit,'valid_until',rolvaliduntil::text) ORDER BY rolname),'[]'::jsonb) FROM pg_roles) AS roles,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',format('%I>%I@%I',pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)),
 'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)),'[]'::jsonb) FROM pg_auth_members) AS memberships,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',format('%I:%I:%s',role,database,name),'name',name,'value',value,'captured',value IS NOT NULL)
 ORDER BY role,database,name),'[]'::jsonb) FROM configs) AS role_config
)
SELECT jsonb_build_object('schema_version',1,'scope',ARRAY['auth','private','public','storage','televoting'],
 'observed_at',transaction_timestamp(),'database',current_database(),'server_version_num',current_setting('server_version_num')::int,
 'read_only',current_setting('transaction_read_only')='on',
 'complete', (SELECT count(*)<=1000 FROM rels) AND (SELECT count(*)<=512 FROM pg_roles)
 AND (SELECT count(*)<=2048 FROM pg_auth_members) AND jsonb_array_length(columns)<=20000 AND jsonb_array_length(policies)<=5000,
 'sections',to_jsonb(sections)) FROM sections;
COMMIT;
