import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { V3_S16_CRITICAL_DOMAINS, type V3S16CatalogEvidence, type V3S16CatalogFunctionEvidence, type V3S16CatalogTableEvidence } from "../src/lib/v3-s16-mutation-authority";

function candidateSha() {
  const requested = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || process.env.GITHUB_SHA?.trim().toLowerCase();
  const checkedOut = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (requested && !/^[0-9a-f]{40}$/.test(requested)) throw new Error("S16 catalog evidence requires an exact 40-character candidate SHA.");
  if (requested && requested !== checkedOut) throw new Error(`S16 catalog candidate ${requested} does not match checked-out SHA ${checkedOut}.`);
  return requested || checkedOut;
}

function databaseUrl() {
  const value = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("S16 catalog evidence requires a valid PostgreSQL URL."); }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing hosted Supabase S16 catalog inspection: database host ${parsed.hostname} is not loopback.`);
  }
  return value;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(dbUrl: string, sql: string) {
  return execFileSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function queryJson<T>(dbUrl: string, sql: string): T {
  const output = query(dbUrl, sql);
  if (!output) throw new Error("S16 pg_catalog query returned no JSON output.");
  return JSON.parse(output) as T;
}

function tableEvidence(dbUrl: string, table: string): V3S16CatalogTableEvidence | null {
  const [schema, name] = table.includes(".") ? table.split(".", 2) : ["public", table];
  const s = sqlLiteral(schema);
  const n = sqlLiteral(name);
  const full = sqlLiteral(`${schema}.${name}`);
  return queryJson<V3S16CatalogTableEvidence | null>(dbUrl, `
    select coalesce((
      select jsonb_build_object(
        'table', ${full},
        'owner', pg_get_userbyid(c.relowner),
        'rlsEnabled', c.relrowsecurity,
        'dmlRoles', coalesce((
          select jsonb_agg(distinct g.grantee order by g.grantee)
          from information_schema.role_table_grants g
          where g.table_schema = ${s} and g.table_name = ${n}
            and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
        ), '[]'::jsonb),
        'columnDmlRoles', coalesce((
          select jsonb_agg(distinct g.grantee order by g.grantee)
          from information_schema.column_privileges g
          where g.table_schema = ${s} and g.table_name = ${n}
            and g.privilege_type in ('INSERT','UPDATE')
        ), '[]'::jsonb),
        'columnDmlGrants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'role', g.grantee, 'privilege', g.privilege_type, 'column', g.column_name
          ) order by g.grantee, g.privilege_type, g.column_name)
          from information_schema.column_privileges g
          where g.table_schema = ${s} and g.table_name = ${n}
            and g.privilege_type in ('INSERT','UPDATE')
        ), '[]'::jsonb),
        'writeTriggers', coalesce((
          select jsonb_agg(t.tgname order by t.tgname)
          from pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal
        ), '[]'::jsonb),
        'updatableViews', coalesce((
          select jsonb_agg(v.table_schema || '.' || v.table_name order by v.table_schema, v.table_name)
          from information_schema.views v
          join information_schema.view_table_usage u
            on u.view_schema = v.table_schema and u.view_name = v.table_name
          where u.table_schema = ${s} and u.table_name = ${n} and v.is_updatable = 'YES'
        ), '[]'::jsonb)
      )
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = ${s} and c.relname = ${n} and c.relkind in ('r','p')
    ), 'null'::jsonb)::text;
  `);
}

type FunctionInventoryRow = V3S16CatalogFunctionEvidence & { definition: string };

function functionInventory(dbUrl: string): FunctionInventoryRow[] {
  return queryJson<FunctionInventoryRow[]>(dbUrl, `
    select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb)::text
    from (
      select jsonb_build_object(
        'name', ns.nspname || '.' || p.proname,
        'owner', pg_get_userbyid(p.proowner),
        'securityDefiner', p.prosecdef,
        'searchPath', coalesce((
          select substring(setting from length('search_path=') + 1)
          from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
          limit 1
        ), ''),
        'executeRoles', coalesce((
          select jsonb_agg(distinct case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end)
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.privilege_type = 'EXECUTE'
        ), '[]'::jsonb),
        'definition', pg_get_functiondef(p.oid)
      ) as row_data
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname in ('public','private','televoting') and p.prokind in ('f','p')
    ) rows;
  `);
}

function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function definitionWritesTable(definition: string, table: string) {
  const [schema, name] = table.includes(".") ? table.split(".", 2) : ["public", table];
  const schemaPattern = `(?:["']?${regexEscape(schema)}["']?\\s*\\.\\s*)?`;
  const tablePattern = `["']?${regexEscape(name)}["']?`;
  const direct = new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+${schemaPattern}${tablePattern}\\b`, "i");
  if (direct.test(definition)) return true;
  const dynamic = /\bexecute\b/i.test(definition) && new RegExp(`\\b${regexEscape(name)}\\b`, "i").test(definition);
  return dynamic;
}

const sha = candidateSha();
const dbUrl = databaseUrl();
const criticalTables = [...new Set(V3_S16_CRITICAL_DOMAINS.flatMap((domain) => domain.canonicalTables))].sort();
const tables = criticalTables.flatMap((table) => {
  const evidence = tableEvidence(dbUrl, table);
  return evidence ? [evidence] : [];
});
const functions = functionInventory(dbUrl).map(({ definition, ...fn }) => ({
  ...fn,
  searchPath: fn.searchPath || null,
  writesTables: criticalTables.filter((table) => definitionWritesTable(definition, table)),
}));

const evidence: V3S16CatalogEvidence = {
  schemaVersion: 1,
  candidateSha: sha,
  tables,
  functions,
};
const outputArgument = process.argv.find((value) => value.startsWith("--out="))?.slice("--out=".length);
const output = resolve(outputArgument || process.env.V3_S16_CATALOG_OUT?.trim() || "v3-release-preflight/s16/catalog-evidence.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`S16 exact-SHA catalog evidence: ${tables.length}/${criticalTables.length} critical tables; ${functions.length} inspected functions; ${output}\n`);
