-- S02: local disposable-only pg_catalog privilege-bit query for exactly
-- four relevant namespaces. Run after observed 56-table schema + GRANT import,
-- BEFORE S13 recovery creates its own new relations.
WITH roles(role) AS (
 VALUES ('anon'),('authenticated'),('service_role')
), observed_tables AS (
 SELECT jsonb_build_object('relation',n.nspname||'.'||c.relname,
 'roles',(SELECT jsonb_object_agg(role,jsonb_build_object(
  'SELECT',has_table_privilege(role,c.oid,'SELECT'),
  'INSERT',has_table_privilege(role,c.oid,'INSERT'),
  'UPDATE',has_table_privilege(role,c.oid,'UPDATE'),
  'DELETE',has_table_privilege(role,c.oid,'DELETE')) ORDER BY role)
  FROM roles)) AS meta
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('auth','private','public','televoting') AND c.relkind IN ('r','p')
), observed_schemas AS (
 SELECT jsonb_build_object('schema',n.nspname,
 'roles',(SELECT jsonb_object_agg(role,jsonb_build_object(
  'USAGE',has_schema_privilege(role,n.nspname,'USAGE'),
  'CREATE',has_schema_privilege(role,n.nspname,'CREATE')) ORDER BY role)
  FROM roles)) AS meta
 FROM pg_catalog.pg_namespace n
 WHERE n.nspname IN ('auth','private','public','televoting')
)
SELECT jsonb_build_object(
 'tables',(SELECT COALESCE(jsonb_agg(meta ORDER BY meta->>'relation'),'[]'::jsonb) FROM observed_tables),
 'schemas',(SELECT COALESCE(jsonb_agg(meta ORDER BY meta->>'schema'),'[]'::jsonb) FROM observed_schemas)
)::text;
