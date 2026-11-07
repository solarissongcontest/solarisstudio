#!/usr/bin/env node
/**
 * Synthetic, isolated local S13 foundation rehearsal ONLY.
 * Never target production, linked Supabase, or an existing local Supabase DB.
 * The script refuses any cluster that already has non-default databases or
 * any of the Supabase roles that it would temporarily create.
 *
 * Requires a fresh, disposable PostgreSQL 16 service on 127.0.0.1:
 * SOLARIS_S13_DISPOSABLE_CLUSTER=YES SOLARIS_LOCAL_DB_PORT=54322 \
 *   node scripts/rehearse-v3-s13-foundation-local.mjs
 *
 * This executes the canonical source S13 SQL only on an isolated disposable
 * database. It never records production migration history or deploys SQL.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalFile = resolve(root, "supabase/migrations/20261019111000_v3_s13_migration_hardening.sql");
const original = readFileSync(canonicalFile, "utf8");
if (!original.startsWith("begin;\n") || !original.trimEnd().endsWith("commit;")) {
  throw new Error("FAIL CLOSED: canonical S13 source has unexpected transaction boundaries");
}
if (original.includes("supabase_migrations.schema_migrations") || original.includes("drop table")) {
  throw new Error("FAIL CLOSED: canonical S13 source contains an unexpected destructive/history action");
}
if (process.env.SOLARIS_S13_DISPOSABLE_CLUSTER !== "YES") {
  console.error("FAIL CLOSED: a fresh disposable LOCAL PostgreSQL cluster is mandatory");
  process.exit(2);
}
const port = process.env.SOLARIS_LOCAL_DB_PORT ?? "54322";
if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("Invalid LOCAL PostgreSQL port");
}
const dbName = "solaris_v3_s13_" + process.pid;
const env = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGHOSTADDR: "127.0.0.1",
  PGPORT: port,
  PGUSER: "postgres",
  PGPASSWORD: process.env.SOLARIS_LOCAL_DB_PASSWORD ?? "postgres",
  PGSSLMODE: "disable",
  PGCONNECT_TIMEOUT: "5",
  PGOPTIONS: "",
};
delete env.PGSERVICE;
delete env.PGSERVICEFILE;

function psql(args, database = "postgres", expectedFailure = false) {
  try {
    const output = execFileSync("psql", [
      "-w", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
      "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", database,
      ...args,
    ], {
      cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    if (expectedFailure) throw new Error("An unauthorized local S13 command unexpectedly succeeded");
    return output.trim();
  } catch (error) {
    if (expectedFailure && error.status !== undefined) return String(error.stderr ?? "");
    throw new Error("Synthetic local PostgreSQL failed: " + String(error.stderr ?? error.message));
  }
}
const query = (statement, database = dbName, expectedFailure = false) =>
  psql(["-c", statement], database, expectedFailure);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const tables = [
  "private.v3_migration_contracts",
  "private.v3_schema_compatibility",
  "private.v3_schema_compatibility_history",
  "private.v3_backfill_jobs",
  "private.v3_migration_parity_runs",
];
const signatures = [
  "public.v3_schema_compatibility(integer)",
  "public.v3_register_migration_contract(text,integer,text,boolean,text,text)",
  "public.v3_claim_backfill(text,integer,integer,text,integer,bigint)",
  "public.v3_checkpoint_backfill(text,text,jsonb,integer,integer,text,boolean)",
  "public.v3_fail_backfill(text,text,text)",
  "public.v3_record_migration_parity(text,text,bigint,bigint,bigint,bigint,integer,jsonb)",
  "public.v3_set_schema_compatibility(integer,integer,integer,text,text,text)",
];
const registration = "public.v3_register_migration_contract(text,integer,text,boolean,text,text)";
const registerCall =
  "public.v3_register_migration_contract(" +
  "'synthetic.s13.local',1,'reversible',false,null,'Local synthetic S13 proof')";
let databaseCreated = false;
let rolesCreated = false;
try {
  // A local port forward to an existing Supabase cluster must FAIL here before
  // any DDL. Require the virgin shape of a fresh postgres service container.
  assert(query("select count(*) from pg_database where not datistemplate and datname <> 'postgres'", "postgres") === "0",
    "Not an empty disposable cluster: user databases exist");
  assert(query("select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')", "postgres") === "0",
    "Supabase roles already exist: refusing to modify an existing cluster");

  query("create role anon nologin", "postgres");
  query("create role authenticated nologin", "postgres");
  query("create role service_role nologin", "postgres");
  rolesCreated = true;
  query('create database "' + dbName + '"', "postgres");
  databaseCreated = true;

  query("create schema private");
  // Minimal synthetic replacement for an already-present hosted prerequisite.
  // This is NOT a production authorization helper implementation.
  query([
    "create function private.studio2_request_is_service_role() returns boolean",
    "language sql stable as $helper$",
    "select coalesce(current_setting('request.jwt.claim.role', true),'') = 'service_role'",
    "$helper$",
  ].join("\n"));

  psql(["-f", canonicalFile], dbName);

  for (const table of tables) {
    assert(query("select to_regclass('" + table + "') is not null") === "t",
      "S13 source failed to create table " + table);
  }
  for (const signature of signatures) {
    assert(query("select to_regprocedure('" + signature + "') is not null") === "t",
      "S13 source failed to create RPC " + signature);
  }
  assert(query("select count(*) from private.v3_schema_compatibility where singleton = true and current_schema_version = 1") === "1",
    "Initial S13 compatibility state missing or unexpectedly changed");
  assert(query("select count(*) from private.v3_migration_contracts where migration_key='v3.s13.migration-hardening' and schema_version=1") === "1",
    "Canonical S13 bootstrap contract missing");

  assert(query("select has_function_privilege('service_role','" + registration + "','EXECUTE')") === "t",
    "Service execution grant on S13 registration missing");
  assert(query("select has_function_privilege('anon','" + registration + "','EXECUTE')") === "f",
    "S13 registration accidentally exposed to anonymous users");
  assert(query("select has_function_privilege('authenticated','" + registration + "','EXECUTE')") === "f",
    "S13 registration accidentally exposed to authenticated users");
  assert(query("select has_table_privilege('service_role','private.v3_migration_contracts','INSERT')") === "f",
    "S13 contract table incorrectly permits service direct inserts");

  const runAsService = [
    "begin",
    "set local role service_role",
    "set local request.jwt.claim.role = 'service_role'",
    "select (" + registerCall + " ->> 'replayed')::boolean",
    "commit",
  ].join("; ") + ";";
  assert(query(runAsService).split("\n").includes("f"), "Service role could not register a new canonical contract");
  assert(query(runAsService).split("\n").includes("t"), "Service role could not replay identical contract");
  const denied = [
    "begin",
    "set local role anon",
    "set local request.jwt.claim.role = 'service_role'",
    "select " + registerCall,
  ].join("; ") + ";";
  query(denied, dbName, true);

  // A second source replay is a local idempotence check, NOT permission to
  // replay a historical SQL migration against production.
  psql(["-f", canonicalFile], dbName);
  assert(query("select count(*) from private.v3_schema_compatibility") === "1",
    "Second local S13 replay duplicated compatibility state");
  assert(query("select count(*) from private.v3_migration_contracts where migration_key='v3.s13.migration-hardening'") === "1",
    "Second local S13 replay duplicated bootstrap contract");

  console.log("PASS: isolated S13 foundation: 5 tables, 7 RPCs, service-only registration, idempotence, restricted direct writes");
} finally {
  if (databaseCreated) {
    try {
      query('drop database "' + dbName + '" with (force)', "postgres");
    } catch (error) {
      console.error("FAIL: could not remove disposable local S13 database: " + String(error));
      process.exitCode = 1;
    }
  }
  if (rolesCreated) {
    try {
      query("drop role service_role; drop role authenticated; drop role anon", "postgres");
    } catch (error) {
      console.error("FAIL: could not remove disposable local S13 roles: " + String(error));
      process.exitCode = 1;
    }
  }
}
