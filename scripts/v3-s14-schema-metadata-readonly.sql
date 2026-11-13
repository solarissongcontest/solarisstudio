-- Solaris V3 S14: HOSTED METADATA-ONLY catalog fingerprint.
-- READ ONLY. Inspect pg_catalog only. NO application row data.
-- Manually execute against hosted only for evidence; CI runs on disposable local.
WITH targets(schema_name,table_name) AS (
  VALUES ('private','v3_domain_event_outbox'),
   ('private','v3_domain_events'),('private','v3_result_versions'),
   ('public','admin_notifications'),('public','notification_deliveries'),
   ('public','studio2_edition_runtime'),('public','studio2_operation_receipts'),
   ('public','studio2_organizer_tasks')
),
objects AS (
  SELECT n.nspname||'.'||c.relname AS relation,
    jsonb_build_object(
      'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',(
        SELECT COALESCE(jsonb_object_agg(a.attname,
          jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
            'not_null',a.attnotnull,'identity',a.attidentity::text,
            'default_hash',CASE WHEN d.oid IS NULL THEN null
            ELSE md5(pg_get_expr(d.adbin,d.adrelid)) END
          )),'{}'::jsonb)
        FROM pg_attribute a LEFT JOIN pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      ),
      'constraints',(
        SELECT COALESCE(jsonb_object_agg(k.conname,
         jsonb_build_object('type',k.contype::text,'validated',k.convalidated,
            'definition_hash',md5(pg_get_constraintdef(k.oid)))),'{}'::jsonb)
        FROM pg_constraint k WHERE k.conrelid=c.oid
      ),
      'indexes',(
        SELECT COALESCE(jsonb_object_agg(ci.relname,
          jsonb_build_object('unique',ix.indisunique,'primary',ix.indisprimary,
          'valid',ix.indisvalid,'definition_hash',md5(pg_get_indexdef(ci.oid))
          )),'{}'::jsonb)
        FROM pg_index ix JOIN pg_class ci ON ci.oid=ix.indexrelid
        WHERE ix.indrelid=c.oid
      ),
      'triggers',(
        SELECT COALESCE(jsonb_object_agg(t.tgname,
         jsonb_build_object('enabled',t.tgenabled::text,
         'definition_hash',md5(pg_get_triggerdef(t.oid)))),'{}'::jsonb)
        FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal
      ),
      'policies',(
        SELECT COALESCE(jsonb_object_agg(p.polname,
          jsonb_build_object('command',p.polcmd::text,
            'permissive',p.polpermissive,
            'roles',(
              SELECT COALESCE(jsonb_agg(x.role_name ORDER BY x.role_name),'[]'::jsonb)
              FROM (
                SELECT CASE WHEN role_oid=0 THEN 'PUBLIC'
                  ELSE pg_get_userbyid(role_oid) END AS role_name
                FROM unnest(p.polroles) AS role_oid
              ) x
            ),
            'definition_hash',md5(
              COALESCE(pg_get_expr(p.polqual,p.polrelid),'')
              ||'|'||COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'')
            )
          )),'{}'::jsonb)
        FROM pg_policy p WHERE p.polrelid=c.oid
      ),
      'acl',jsonb_build_object(
        'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
        'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
        'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
        'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
        'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
        'service_select',has_table_privilege('service_role',c.oid,'SELECT'),
        'service_insert',has_table_privilege('service_role',c.oid,'INSERT'),
        'service_update',has_table_privilege('service_role',c.oid,'UPDATE')
      )
    ) AS attributes
  FROM targets target JOIN pg_namespace n ON n.nspname=target.schema_name
    JOIN pg_class c ON c.relnamespace=n.oid
    AND c.relname=target.table_name AND c.relkind IN ('r','p')
)
SELECT jsonb_build_object('format_version',1,
  'scope','eight-table-v3-s14-hosted-metadata-only',
  'tables',COALESCE(jsonb_object_agg(relation,attributes),'{}'::jsonb)
)::text AS schema_metadata FROM objects;
