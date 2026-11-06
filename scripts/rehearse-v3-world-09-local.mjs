#!/usr/bin/env node
/**
 * Optional WORLD-09 read-only schema rehearsal on a disposable/local PostgreSQL.
 * Never falls back to a .env, Supabase host or unspecified DATABASE_URL.
 * Usage: V3_WORLD09_LOCAL_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *        node scripts/rehearse-v3-world-09-local.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raw = process.env.V3_WORLD09_LOCAL_DATABASE_URL;
if (!raw) throw new Error("Set V3_WORLD09_LOCAL_DATABASE_URL to an explicit loopback disposable database");
let endpoint;
try { endpoint = new URL(raw); } catch { throw new Error("Invalid local-only database URL"); }
const host = endpoint.hostname.replace(/^\[|\]$/g, "").toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(host) ||
    !["postgresql:", "postgres:"].includes(endpoint.protocol) ||
    endpoint.searchParams.size > 0 || endpoint.hash || endpoint.username.length === 0) {
  throw new Error("Refusing non-local, redirected, unauthenticated or ambiguous database endpoint");
}
// Do not inherit ambient libpq routing overrides; a nonlocal PGHOST/PGSERVICE
// must never make an otherwise loopback-looking connection reach production.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^PG(HOST|HOSTADDR|SERVICE|SERVICEFILE|PASSFILE|OPTIONS|DATABASE|PORT|USER|SSLMODE|SSLROOTCERT)$/i.test(key)) {
    delete env[key];
  }
}
const sqlFile = fileURLToPath(new URL("../.github/scripts/v3-world-09-schema-rehearsal.sql", import.meta.url));
const result = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", raw, "-f", sqlFile],
  { env, stdio: "inherit", timeout: 30_000 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("WORLD-09 local schema rehearsal failed");
console.log("WORLD-09 local schema and publication contracts verified on an explicit loopback database");
