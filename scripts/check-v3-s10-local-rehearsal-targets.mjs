#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_MARKERS = new Set(["local", "localhost", "local-test", "test-local", "supabase-local", "127.0.0.1", "::1"]);

function assertUrl(raw, kind, name) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!LOOPBACK.has(host)) throw new Error(`${name} is not loopback-only`);
  if (!url.port) throw new Error(`${name} requires an explicit local port`);
  if (url.search || url.hash) throw new Error(`${name} must not contain connection overrides or fragments`);
  if (kind === "api") {
    if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/") {
      throw new Error(`${name} is not a local Supabase HTTP API origin`);
    }
  } else if (kind === "db") {
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.username !== "postgres" || !url.password || url.pathname !== "/postgres") {
      throw new Error(`${name} is not the local Supabase PostgreSQL database`);
    }
  }
  return raw;
}

function assertAmbientLocal(environment) {
  for (const key of ["PGHOST", "PGHOSTADDR"]) {
    const host = environment[key]?.trim().toLowerCase();
    if (host && !LOOPBACK.has(host.replace(/^\[|\]$/g, ""))) throw new Error(`${key} can redirect libpq outside loopback`);
  }
  for (const key of ["PGSERVICE", "PGSERVICEFILE"]) {
    if (environment[key]?.trim()) throw new Error(`${key} can redirect libpq through a service definition`);
  }
  if (environment.PGDATABASE?.trim() && environment.PGDATABASE.trim() !== "postgres") {
    throw new Error("PGDATABASE may override the database authority");
  }
  if (environment.PGPORT?.trim() && !/^[0-9]{1,5}$/.test(environment.PGPORT.trim())) {
    throw new Error("PGPORT is not a single numeric port");
  }

  for (const [key, value] of Object.entries(environment)) {
    if (!value?.trim()) continue;
    if (/^(?:(?:VITE_|E2E_)?SUPABASE_URL|(?:VITE_|E2E_)?CONFIRMATIONS_SUPABASE_URL|DATABASE_URL|POSTGRES_URL|SUPABASE_DB_URL)$/i.test(key) || /SUPABASE(?:_[A-Z0-9]+)*_URL$/i.test(key)) {
      const u = new URL(value);
      const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      if (!LOOPBACK.has(host) || u.search || u.hash) throw new Error(`${key} is not a safe loopback target`);
    }
    if (/SUPABASE.*(?:PROJECT_ID|PROJECT_REF)$/i.test(key) && !LOCAL_MARKERS.has(value.trim().toLowerCase())) {
      throw new Error(`${key} is not a local project identity`);
    }
    if (/SERVICE_ROLE.*KEY$/i.test(key) && environment.V3_SERVICE_ROLE_SCOPE !== "local") {
      throw new Error(`${key} requires V3_SERVICE_ROLE_SCOPE=local`);
    }
  }
}

export function parseS10LocalTargets(output, environment = process.env) {
  if (typeof output !== "string" || output.length > 65536) throw new Error("Supabase local status is missing or oversized");
  const found = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!/^\s*(?:export\s+)?(?:API_URL|DB_URL)\s*=/.test(line)) continue;
    const match = line.match(/^\s*(?:export\s+)?(API_URL|DB_URL)\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"'\x60]+))\s*$/);
    if (!match) throw new Error("Malformed API_URL/DB_URL in local Supabase status");
    const name = match[1];
    if (found.has(name)) throw new Error(`Duplicate ${name} in local Supabase status`);
    found.set(name, match[2] ?? match[3] ?? match[4]);
  }
  const apiUrl = found.get("API_URL");
  const dbUrl = found.get("DB_URL");
  if (!apiUrl || !dbUrl) throw new Error("Local Supabase status must provide API_URL and DB_URL");
  assertUrl(apiUrl, "api", "API_URL");
  assertUrl(dbUrl, "db", "DB_URL");
  assertAmbientLocal(environment);
  return { apiUrl, dbUrl };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  try {
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 65536) throw new Error("Supabase status output exceeds safety limit");
    }
    const { apiUrl, dbUrl } = parseS10LocalTargets(input);
    process.stdout.write(`${apiUrl}\n${dbUrl}\n`);
  } catch (error) {
    process.stderr.write(`Refusing non-local S10 rehearsal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
