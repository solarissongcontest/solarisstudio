-- S06 operator-approved, bounded pg_catalog metadata snapshot and LOCAL-only comparator.
-- Four explicitly named application schemas. NO application rows, function bodies,
-- default expressions, trigger definitions, policies, passwords or keys are exported:
-- definition and contract strings are hashed INSIDE PostgreSQL.
-- CI MUST run this only against isolated/disposable PostgreSQL; NEVER hosted Supabase.
-- An operator may use it for a separately authorized, read-only hosted metadata snapshot.
WITH relation_objects AS (
  SELECT n.nspname AS schema_name,
         c.relname AS object_name,
         c.relkind::text AS object_kind,
         pg_get_userbyid(c.relowner) AS owner_name,
         c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS rls_forced,
         md5(COALESCE(c.relacl::text,'')) AS acl_md5,
         (SELECT count(*)::int FROM pg_attribute a
           WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_count,
         (SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(
                       a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
                       a.attnotnull,a.attidentity,a.attgenerated,
                       COALESCE((SELECT coll_ns.nspname || '.' || coll.collname
                         FROM pg_collation coll JOIN pg_namespace coll_ns
                           ON coll_ns.oid=coll.collnamespace
                        WHERE coll.oid=a.attcollation),''),
                       pg_get_expr(d.adbin,d.adrelid)
                     ) ORDER BY a.attnum)::text,'[]'))
            FROM pg_attribute a LEFT JOIN pg_attrdef d
              ON d.adrelid=a.attrelid AND d.adnum=a.attnum
           WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns_md5,
         (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraint_count,
         (SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(
                     k.conname,k.contype,pg_get_constraintdef(k.oid,true)
                   ) ORDER BY k.conname)::text,'[]'))
            FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints_md5,
         (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) AS index_count,
         (SELECT md5(COALESCE(jsonb_agg(
                     pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text
                   )::text,'[]'))
            FROM pg_index i WHERE i.indrelid=c.oid) AS indexes_md5,
         (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count,
         (SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(
                     p.polname,p.polcmd,p.polpermissive,ARRAY(SELECT pg_get_userbyid(rr.oid)
                           FROM unnest(p.polroles) AS rr(oid)
                          ORDER BY pg_get_userbyid(rr.oid))::text,
                     pg_get_expr(p.polqual,p.polrelid),
                     pg_get_expr(p.polwithcheck,p.polrelid)
                   ) ORDER BY p.polname)::text,'[]'))
            FROM pg_policy p WHERE p.polrelid=c.oid) AS policies_md5,
         (SELECT count(*)::int FROM pg_trigger t
           WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS trigger_count,
         (SELECT md5(COALESCE(jsonb_agg(
                     pg_get_triggerdef(t.oid,true) ORDER BY t.tgname
                   )::text,'[]'))
            FROM pg_trigger t
           WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers_md5
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('auth','public','private','televoting')
     AND c.relkind IN ('r','p')
),
routine_objects AS (
  SELECT n.nspname AS schema_name,
         p.proname AS object_name,
         format('%I.%I(%s)',n.nspname,p.proname,
           pg_get_function_identity_arguments(p.oid)) AS signature,
         p.prokind::text AS object_kind,
         pg_get_userbyid(p.proowner) AS owner_name,
         p.prosecdef AS security_definer,
         p.proisstrict AS strict,
         p.proleakproof AS leakproof,
         p.provolatile::text AS volatility,
         p.proparallel::text AS parallel,
         format_type(p.prorettype,NULL) AS return_type,
         md5(pg_get_functiondef(p.oid)) AS definition_md5,
         md5(COALESCE(p.proacl::text,'')) AS acl_md5,
         md5(COALESCE(p.proconfig::text,'')) AS settings_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('auth','public','private','televoting')
     AND p.prokind='f'
),
schema_objects AS (
  SELECT n.nspname AS schema_name,
         pg_get_userbyid(n.nspowner) AS owner_name,
         md5(COALESCE(n.nspacl::text,'')) AS acl_md5
    FROM pg_namespace n
   WHERE n.nspname IN ('auth','public','private','televoting')
)
SELECT jsonb_build_object(
  'pg_version_num',current_setting('server_version_num')::int,
  'schemas',(SELECT jsonb_agg(to_jsonb(s) ORDER BY schema_name) FROM schema_objects s),
  'relations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY schema_name,object_name) FROM relation_objects r),
  'routines',(SELECT jsonb_agg(to_jsonb(f) ORDER BY schema_name,signature) FROM routine_objects f)
)::text AS manifest;
