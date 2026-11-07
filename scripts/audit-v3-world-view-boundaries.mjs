#!/usr/bin/env node
/**
 * TG19: independently verify World SQL view exposure on disposable PostgreSQL.
 * This never reads hosted Supabase, edits schema, or certifies a release.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const WORLD_VIEW_CATALOG_SQL = `
select jsonb_build_object(
  'roles', jsonb_build_object(
    'anon', to_regrole('anon') is not null,
    'authenticated', to_regrole('authenticated') is not null
  ),
  'views', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', c.relkind,
      'securityInvoker', exists (
        select 1 from unnest(coalesce(c.reloptions, array[]::text[])) as opt
        where lower(opt) in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')
      ),
      'anonSelect', case when to_regrole('anon') is not null
        then has_any_column_privilege('anon', c.oid, 'SELECT') else false end,
      'authenticatedSelect', case when to_regrole('authenticated') is not null
        then has_any_column_privilege('authenticated', c.oid, 'SELECT') else false end
    ) order by n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname ~ '^world_'
      and c.relkind in ('v', 'm')
  ), '[]'::jsonb)
)::text;
`;

/** Explicit Postgres URL required. libpq query overrides and remote authorities fail closed. */
export function validateLocalDatabaseUrl(input) {
  if (typeof input !== "string" || !input) throw new Error("WORLD_LOCAL_DATABASE_URL is required");
  let url;
  try { url = new URL(input); }
  catch { throw new Error("Invalid PostgreSQL URL"); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error("Only PostgreSQL URLs are permitted");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("PostgreSQL host must be explicit loopback");
  if (!url.port || !/^\d+$/.test(url.port))
    throw new Error("Explicit local PostgreSQL port required");
  if (url.pathname !== "/postgres")
    throw new Error("Only the disposable local postgres database is permitted");
  if (url.search || url.hash)
    throw new Error("Connection query overrides and fragments are forbidden");
  return input;
}

const rowObject = (value) => value && typeof value === "object" && !Array.isArray(value);
export function auditWorldViewRows(catalog) {
  if (!rowObject(catalog) || !rowObject(catalog.roles) || !Array.isArray(catalog.views))
    throw new Error("Malformed PostgreSQL view catalog response");
  if (catalog.roles.anon !== true || catalog.roles.authenticated !== true)
    throw new Error("Expected local Supabase anon and authenticated roles are absent");
  const findings = [];
  const seen = new Set();
  for (const row of catalog.views) {
    if (!rowObject(row) || row.schema !== "public" ||
        typeof row.name !== "string" || !/^world_/.test(row.name) ||
        !["v", "m"].includes(row.kind) ||
        typeof row.securityInvoker !== "boolean" ||
        typeof row.anonSelect !== "boolean" ||
        typeof row.authenticatedSelect !== "boolean")
      throw new Error("Malformed World view metadata");
    if (seen.has(row.name)) throw new Error("Duplicate World view catalog row");
    seen.add(row.name);
    const readableBy = ["anon", "authenticated"].filter(
      role => row[role === "anon" ? "anonSelect" : "authenticatedSelect"]
    );
    if (readableBy.length === 0) continue;
    if (row.kind === "m") {
      findings.push({ code: "WORLD_MATERIALIZED_VIEW_BROWSER_READ", view: row.name, readableBy });
    } else if (!row.securityInvoker) {
      findings.push({ code: "WORLD_OWNER_VIEW_BROWSER_READ", view: row.name, readableBy });
    }
  }
  return { checkedViews: catalog.views.length, findings, passed: findings.length === 0 };
}

export function isolatedPgEnvironment(env) {
  const safe = { ...env };
  for (const key of Object.keys(safe)) if (/^PG[A-Z_]/.test(key)) delete safe[key];
  safe.PGCONNECT_TIMEOUT = "3";
  return safe;
}

export function runLocalAudit(databaseUrl, options = {}) {
  const url = validateLocalDatabaseUrl(databaseUrl);
  const runner = options.runner ?? execFileSync;
  const stdout = runner("psql", [
    "--no-psqlrc", "--no-password", "--tuples-only", "--no-align", "--quiet",
    "--set=ON_ERROR_STOP=1", "--dbname", url, "--command", WORLD_VIEW_CATALOG_SQL,
  ], {
    encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024,
    env: isolatedPgEnvironment(options.env ?? process.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let parsed;
  try { parsed = JSON.parse(String(stdout).trim()); }
  catch { throw new Error("Local PostgreSQL did not return valid catalog JSON"); }
  return auditWorldViewRows(parsed);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--help")) {
      console.log("Usage: WORLD_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' node scripts/audit-v3-world-view-boundaries.mjs");
    } else {
      const result = runLocalAudit(process.env.WORLD_LOCAL_DATABASE_URL);
      console.log(JSON.stringify({
        audit: "TG19 World view privilege boundaries", environment: "explicit loopback PostgreSQL",
        certification: "SOURCE/LOCAL AUDIT ONLY; not a release or deployment certificate",
        ...result,
      }, null, 2));
      if (!result.passed) process.exitCode = 1;
    }
  } catch {
    // Never echo database URLs, credentials, PostgreSQL stderr, or private rows.
    console.error("World view audit failed closed: invalid local configuration or catalog response.");
    process.exitCode = 2;
  }
}
