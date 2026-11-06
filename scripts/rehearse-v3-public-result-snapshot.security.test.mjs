import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const runner = resolve("scripts/rehearse-v3-public-result-snapshot.sh");

function rehearsal(api, db, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "solaris-snapshot-url-gate-"));
  const bin = join(root, "bin");
  const called = join(root, "psql-called");
  mkdirSync(bin);
  const fakeSupabase = join(bin, "supabase");
  const fakePsql = join(bin, "psql");
  // Test calls fake local programs only. It cannot contact a real Supabase project.
  writeFileSync(fakeSupabase, '#!/bin/sh\nprintf \'API_URL="%s"\\nDB_URL="%s"\\n\' "$TEST_API_URL" "$TEST_DB_URL"\n');
  writeFileSync(fakePsql, '#!/bin/sh\nprintf \'called\\n\' > "$PSQL_CALLED_MARKER"\nexit 79\n');
  chmodSync(fakeSupabase, 0o755);
  chmodSync(fakePsql, 0o755);
  try {
    const child = spawnSync("bash", [runner], {
      cwd: resolve("."),
      env: {
        ...process.env,
        PGHOST: "", PGHOSTADDR: "", PGSERVICE: "", PGSERVICEFILE: "", PGOPTIONS: "",
        ...extra,
        PATH: bin + ":" + (process.env.PATH ?? ""),
        TEST_API_URL: api,
        TEST_DB_URL: db,
        PSQL_CALLED_MARKER: called,
      },
      encoding: "utf8",
      timeout: 5000,
    });
    return {
      status: child.status,
      error: child.error,
      stderr: child.stderr,
      stdout: child.stdout,
      called: existsSync(called),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const safeApi = "http://127.0.0.1:54321";
const safeDb = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("URL preflight executes before any real database command", () => {
  const source = readFileSync(runner, "utf8");
  assert.ok(source.indexOf("node --input-type=module") >= 0);
  assert.ok(source.indexOf("node --input-type=module") < source.indexOf("db_exec()"));
  assert.ok(source.includes("set -euo pipefail"));
});

test("disguised external URL authorities and libpq URI overrides are rejected before psql", () => {
  for (const [api, db] of [
    ["http://localhost:54321@evil.example", safeDb],
    [safeApi, "postgresql://postgres:postgres@127.0.0.1:54322@evil.example/postgres"],
    [safeApi, "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=evil.example"],
    [safeApi, "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=203.0.113.9"],
    ["https://127.0.0.1:54321", safeDb],
    ["http://localhost.evil.example:54321", safeDb],
    ["http://127.0.0.1:54321/api", safeDb],
    [safeApi, "postgresql://other:postgres@127.0.0.1:54322/postgres"],
    [safeApi, "postgresql://postgres:postgres@127.0.0.1:54322/other"],
  ]) {
    const outcome = rehearsal(api, db);
    assert.equal(outcome.error, undefined, JSON.stringify([api, db]));
    assert.notEqual(outcome.status, 0, JSON.stringify([api, db]));
    assert.equal(outcome.called, false, JSON.stringify([api, db]));
    assert.match(outcome.stderr, /Refusing|Unsafe/i);
  }
});

test("host/service/option overrides are forbidden even with local URLs", () => {
  for (const envName of ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) {
    const outcome = rehearsal(safeApi, safeDb, { [envName]: "evil.example" });
    assert.equal(outcome.called, false, envName);
    assert.match(outcome.stderr, /Refusing/i);
  }
});

test("valid loopback URLs pass preflight, then reach only the fake psql", () => {
  for (const [api, db] of [
    [safeApi, safeDb],
    ["http://localhost:54321", "postgres://postgres:postgres@localhost:54322/postgres"],
  ]) {
    const outcome = rehearsal(api, db);
    assert.equal(outcome.called, true, JSON.stringify([api, db]));
    assert.equal(outcome.status, 79);
  }
});
