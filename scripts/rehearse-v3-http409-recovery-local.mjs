#!/usr/bin/env node
/**
 * Operator-only LOCAL PostgreSQL rehearsal for the candidate HTTP409 repair.
 *
 * This deliberately ignores SUPABASE_URL and DATABASE_URL and hard-codes the
 * connection hostname to 127.0.0.1. It creates a temporary disposable database
 * using synthetically defined RPCs, never queries hosted application rows, and
 * drops that database in a finally block.
 *
 * Prerequisites: local Supabase/Postgres running and psql installed.
 *   SOLARIS_RUN_LOCAL_DB_REHEARSAL=YES \
 *   SOLARIS_LOCAL_DB_PORT=54322 \
 *   node scripts/rehearse-v3-http409-recovery-local.mjs
 *
 * Passing this synthetic check does NOT establish hosted-head-equivalent
 * compatibility, production SQL safety, an approved migration, or release.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = resolve(root, "docs/v3/recovery-candidates/forward-only-deterministic-http409.sql");
const sqlText = readFileSync(sqlPath, "utf8");
const sigBlock = sqlText.match(/v_signatures constant text\[\] := array\[([\s\S]*?)\];/);
if (!sigBlock) throw new Error("Unable to read static allowlist");
const signatures = [...sigBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (signatures.length !== 29 || new Set(signatures).size !== 29) {
  throw new Error("Expected exactly 29 unique reviewed RPC signatures");
}

if (process.env.SOLARIS_RUN_LOCAL_DB_REHEARSAL !== "YES") {
  console.error("FAIL CLOSED: set SOLARIS_RUN_LOCAL_DB_REHEARSAL=YES for a disposable LOCAL test");
  process.exit(2);
}

const port = process.env.SOLARIS_LOCAL_DB_PORT ?? "54322";
if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("Invalid local Postgres port");
}
const user = "postgres";
const dbName = `solaris_v3_http409_${process.pid}`;
const pgEnv = {
  ...process.env,
  PGHOST: "127.0.0.1",
  // libpq can prefer PGHOSTADDR over -h; override inherited production values.
  PGHOSTADDR: "127.0.0.1",
  PGCONNECT_TIMEOUT: "5",
  PGPORT: port,
  PGUSER: user,
  PGDATABASE: "postgres",
  PGPASSWORD: process.env.SOLARIS_LOCAL_DB_PASSWORD ?? "postgres",
  PGOPTIONS: "",
  PGSSLMODE: "disable",
};
// libpq must not inherit a named remote service, including the empty string.
delete pgEnv.PGSERVICE;
delete pgEnv.PGSERVICEFILE;

function invokePsql(args, database = "postgres", expectFailure = false) {
  try {
    const stdout = execFileSync("psql", [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-h", "127.0.0.1", "-p", port, "-U", user, "-d", database,
      ...args,
    ], {
      cwd: root, encoding: "utf8", env: pgEnv, stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    if (expectFailure) throw new Error("Expected forward-only SQL to reject invalid state, but it succeeded");
    return stdout.trim();
  } catch (error) {
    if (expectFailure && error.status !== undefined) return String(error.stderr ?? "");
    throw new Error(`Local PostgreSQL operation failed: ${String(error.stderr ?? error.message)}`);
  }
}

function sql(query, database = dbName, expectFailure = false) {
  return invokePsql(["-c", query], database, expectFailure);
}
function runCandidate(expectFailure = false) {
  return invokePsql(["-f", sqlPath], dbName, expectFailure);
}
function fixtureFunction(signature, includeBothCodes = false) {
  return `create or replace function ${signature}
  returns void language plpgsql security definer
  set search_path = pg_catalog, public
  as $fixture$
  begin
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    ${includeBothCodes ? "raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';" : ""}
  end
  $fixture$;`;
}
function getCodes(signature) {
  const result = sql(`
    select
      (position('''40001''' in pg_get_functiondef(to_regprocedure('${signature}')::oid)) > 0)::text
      || '|' ||
      (position('''PT409''' in pg_get_functiondef(to_regprocedure('${signature}')::oid)) > 0)::text;
  `);
  return result;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let created = false;
try {
  // Connect exclusively to loopback, with no DNS, hosted key, or hosted URL.
  sql(`create database "${dbName}"`, "postgres");
  created = true;
  sql("create schema televoting");
  for (const signature of signatures) sql(fixtureFunction(signature));
  const worker = "public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)";
  sql(fixtureFunction(worker));

  for (const signature of signatures) {
    assert(getCodes(signature) === "true|false", `Fixture setup differs: ${signature}`);
  }

  // First pass: hosted-like old definitions are normalized; worker is untouched.
  runCandidate();
  for (const signature of signatures) {
    assert(getCodes(signature) === "false|true", `First pass failed: ${signature}`);
  }
  assert(getCodes(worker) === "true|false", "DomainEvent worker retry contract changed");

  // Second pass: clean-source/previously-normalized state is a safe no-op.
  runCandidate();
  for (const signature of signatures) {
    assert(getCodes(signature) === "false|true", `Idempotent pass failed: ${signature}`);
  }

  // Missing final signature must fail and roll back a rewrite of the first.
  sql(fixtureFunction(signatures[0]));
  sql(`drop function ${signatures.at(-1)}`);
  const missingResult = runCandidate(true);
  assert(missingResult.includes("V3 conflict reconciliation blocked: missing function"),
    "Missing target did not fail with explicit catalog error");
  assert(getCodes(signatures[0]) === "true|false", "Missing target did not roll back prior rewrite");

  // Mixed status in one target must fail instead of guessing which state wins.
  sql(fixtureFunction(signatures.at(-1), true));
  const mixedResult = runCandidate(true);
  assert(mixedResult.includes("mixed/unknown SQLSTATE"), "Mixed SQLSTATE was not rejected");
  assert(getCodes(signatures[0]) === "true|false", "Mixed status did not roll back changes");
  assert(getCodes(worker) === "true|false", "Negative tests changed worker retry behavior");

  console.log("PASS: 29-function HTTP409 local synthetic replay, idempotence, missing-target rollback, mixed-status rejection, worker preservation");
} finally {
  if (created) {
    try {
      sql(`drop database "${dbName}" with (force)`, "postgres");
    } catch (error) {
      console.error(`WARNING: manual cleanup of disposable LOCAL DB ${dbName} may be needed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
