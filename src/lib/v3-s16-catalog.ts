/** Catalog queries are read-only. SQL-source matching supplies candidates, never proof of authority. */
export function requireS16LocalDatabase(value: string | undefined): string {
  if (!value) throw new Error("S16 requires an explicit disposable database URL; no default database is selected.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid S16 PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search) {
    throw new Error("S16 requires loopback PostgreSQL without connection-option overrides.");
  }
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.toString();
}

export const S16_FUNCTION_CATALOG_SQL = `
select coalesce(jsonb_agg(x order by x->>'identity'), '[]'::jsonb)::text from (
 select jsonb_build_object(
  'name', format('%I.%I', n.nspname,p.proname),
  'identity', format('%I.%I(%s)', n.nspname,p.proname,oidvectortypes(p.proargtypes)),
  'oid',p.oid, 'owner',pg_get_userbyid(p.proowner),
  'ownerSuperuser',o.rolsuper,'ownerBypassRls',o.rolbypassrls,
  'securityDefiner',p.prosecdef,'language',l.lanname,
  'searchPath',(select substr(s,13) from unnest(p.proconfig) s where s like 'search_path=%' limit 1),
  'executeRoles',coalesce((select jsonb_agg(role_name order by role_name) from (
    select r.rolname::text role_name from pg_roles r where has_function_privilege(r.oid,p.oid,'EXECUTE')
    union select 'PUBLIC' from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE'
  ) grants),'[]'::jsonb),
  'definition',pg_get_functiondef(p.oid)
 ) x from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_roles o on o.oid=p.proowner join pg_language l on l.oid=p.prolang
 where n.nspname in ('public','private','televoting','auth') and p.prokind in ('f','p')
) functions;`;

const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export function s16TableCatalogSql(table: string): string {
  const qualified = table.includes(".") ? table : `public.${table}`;
  return `select coalesce((select jsonb_build_object(
   'table',${literal(qualified)},'owner',pg_get_userbyid(c.relowner),'rlsEnabled',c.relrowsecurity,
   'ownerSuperuser',o.rolsuper,'ownerBypassRls',o.rolbypassrls,
   'dmlRoles',coalesce((select jsonb_agg(r.rolname order by r.rolname) from pg_roles r
      where has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')),'[]'::jsonb),
   'columnDmlRoles',coalesce((select jsonb_agg(distinct r.rolname) from pg_roles r
      join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where has_column_privilege(r.oid,c.oid,a.attnum,'INSERT,UPDATE')),'[]'::jsonb),
   'columnPrivileges',coalesce((select jsonb_agg(jsonb_build_object('role',r.rolname,'column',a.attname,
      'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),
      'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE')))
      from pg_roles r join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where has_column_privilege(r.oid,c.oid,a.attnum,'INSERT,UPDATE')),'[]'::jsonb),
   'writeTriggers',coalesce((select jsonb_agg(t.tgname order by t.tgname) from pg_trigger t
      where t.tgrelid=c.oid and not t.tgisinternal and t.tgenabled<>'D'),'[]'::jsonb),
   'triggerDetails',coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
      'function',format('%I.%I(%s)',ns.nspname,p.proname,oidvectortypes(p.proargtypes)),
      'definition',pg_get_triggerdef(t.oid))) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      join pg_namespace ns on ns.oid=p.pronamespace where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb),
   'updatableViews',coalesce((with recursive dependent(oid) as (
     select c.oid union select rw.ev_class from dependent d join pg_depend dep on dep.refobjid=d.oid
       and dep.refclassid='pg_class'::regclass and dep.classid='pg_rewrite'::regclass
       join pg_rewrite rw on rw.oid=dep.objid where rw.ev_class<>d.oid
    ) select jsonb_agg(distinct format('%I.%I',ns.nspname,v.relname)) from dependent d
      join pg_class v on v.oid=d.oid join pg_namespace ns on ns.oid=v.relnamespace
      where v.relkind='v' and pg_relation_is_updatable(v.oid,true)<>0 and exists (
        select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role') and
        (has_table_privilege(r.oid,v.oid,'INSERT,UPDATE,DELETE') or has_any_column_privilege(r.oid,v.oid,'INSERT,UPDATE'))
      )),'[]'::jsonb)
   ) from pg_class c join pg_roles o on o.oid=c.relowner
     where c.oid=to_regclass(${literal(qualified)}) and c.relkind in ('r','p')), 'null'::jsonb)::text;`;
}

export const S16_ROLE_AND_DEFAULT_CATALOG_SQL = `select jsonb_build_object(
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,
   'inherit',rolinherit,'canLogin',rolcanlogin)) from pg_roles),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),
   'member',pg_get_userbyid(member),'adminOption',admin_option,
   'inheritOption',to_jsonb(m)->'inherit_option','setOption',to_jsonb(m)->'set_option')),'[]'::jsonb) from pg_auth_members m),
 'creatorDefaults',(select jsonb_agg(jsonb_build_object('creator',r.rolname,'publicExecute',exists(
   select 1 from aclexplode(coalesce((select d.defaclacl from pg_default_acl d
    where d.defaclrole=r.oid and d.defaclnamespace=0 and d.defaclobjtype='f'),acldefault('f',r.oid))) a
   where a.grantee=0 and a.privilege_type='EXECUTE'))) from pg_roles r),
 'functionDefaults',(select coalesce(jsonb_agg(jsonb_build_object('creator',pg_get_userbyid(d.defaclrole),
   'schema',n.nspname,'acl',d.defaclacl::text)),'[]'::jsonb) from pg_default_acl d
    left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclobjtype='f')
)::text;`;

/** Match qualified relations exactly. Unqualified relations require search-path resolution. */
export function potentialS16Write(definition: string, table: string, searchPath: string | null): boolean {
  const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
  const writes = definition.matchAll(/\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?)\s+(?:only\s+)?((?:"[^"]+"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?)/gi);
  for (const match of writes) {
    const parts = match[1].replaceAll('"', '').replace(/\s/g, '').split('.');
    if (parts.at(-1) !== name) continue;
    if (parts.length === 2) { if (parts[0] === schema) return true; continue; }
    // Unknown resolution remains a candidate, never a clean bill of health.
    const schemas = searchPath?.replaceAll('"', '').split(',').map(s => s.trim());
    if (!schemas || schemas.includes(schema)) return true;
  }
  return false;
}

export function s16PsqlEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {...Object.fromEntries(Object.entries(source).filter(([key]) => !key.startsWith("PG"))), PGCONNECT_TIMEOUT:"5"};
}
