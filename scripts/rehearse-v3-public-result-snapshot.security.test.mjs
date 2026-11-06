import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./rehearse-v3-public-result-snapshot.sh", import.meta.url));
const localApi = "http://127.0.0.1:54321";
const localDb = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function exercise(api = localApi, db = localDb, statusFails = false) {
  const temp = mkdtempSync(join(tmpdir(), "v3-snapshot-isolation-"));
  const supabase = join(temp, "supabase");
  const psql = join(temp, "psql");
  const marker = join(temp, "psql-invoked");
  writeFileSync(supabase, [
    "#!/usr/bin/env bash",
    'if [ "$STUB_STATUS_FAIL" = "1" ]; then exit 17; fi',
    'printf "API_URL=%q\\nDB_URL=%q\\n" "$STUB_API_URL" "$STUB_DB_URL"',
    "",
  ].join("\n"));
  writeFileSync(psql, [
    "#!/usr/bin/env bash",
    'printf "called\\n" >> "$PSQL_MARKER"',
    "exit 88",
    "",
  ].join("\n"));
  chmodSync(supabase, 0o755);
  chmodSync(psql, 0o755);
  const result = spawnSync("bash", [runner], {
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      PATH: temp + delimiter + process.env.PATH,
      STUB_API_URL: api,
      STUB_DB_URL: db,
      STUB_STATUS_FAIL: statusFails ? "1" : "0",
      PSQL_MARKER: marker,
    },
  });
  const psqlInvoked = existsSync(marker);
  rmSync(temp, { recursive: true, force: true });
  return { result, psqlInvoked };
}

for (const [name, api, db] of [
  ["API userinfo points to remote host", "http://localhost:54321@remote.example/", localDb],
  ["API remote subdomain impersonates localhost", "http://localhost.remote.example:54321/", localDb],
  ["hosted production API URL", "https://studio.supabase.co/", localDb],
  ["API URL contains remote redirect parameter", "http://localhost:54321/?host=remote.example", localDb],
  ["API URL includes credentials", "http://admin:token@localhost:54321/", localDb],
  ["API URL has no explicit port", "http://localhost/", localDb],
  ["DB URI userinfo points to remote host", localApi, "postgresql://postgres:postgres@localhost:54322@remote.example/postgres"],
  ["DB URI libpq host override", localApi, "postgresql://postgres:postgres@localhost:54322/postgres?host=remote.example"],
  ["DB URI libpq hostaddr override", localApi, "postgresql://postgres:postgres@localhost:54322/postgres?hostaddr=203.0.113.11"],
  ["DB URI libpq service override", localApi, "postgresql://postgres:postgres@localhost:54322/postgres?service=remote"],
  ["DB URI misleading hostname", localApi, "postgresql://postgres:postgres@localhost.remote.example:54322/postgres"],
  ["DB URI has fragment", localApi, "postgresql://postgres:postgres@localhost:54322/postgres#remote"],
  ["DB URI has unexpected database name", localApi, "postgresql://postgres:postgres@localhost:54322/production"],
  ["DB URI lacks explicit port", localApi, "postgresql://postgres:postgres@localhost/postgres"],
]) {
  test(name + " fails before psql", () => {
    const { result, psqlInvoked } = exercise(api, db);
    assert.equal(result.error, undefined, String(result.error));
    assert.notEqual(result.status, 0, "the unsafe rehearsal unexpectedly succeeded");
    assert.equal(psqlInvoked, false, "a rejected URL must never reach psql");
    assert.match(result.stderr, /Refusing hosted\/non-loopback rehearsal endpoints/);
  });
}

test("valid explicit loopback endpoints reach only the stubbed psql", () => {
  for (const [api, db] of [
    [localApi, localDb],
    ["http://localhost:54321", "postgres://postgres:postgres@localhost:54322/postgres"],
    ["http://[::1]:54321", "postgresql://postgres:postgres@[::1]:54322/postgres"],
  ]) {
    const { result, psqlInvoked } = exercise(api, db);
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(psqlInvoked, true, "valid local CLI endpoints should reach the stubbed SQL call");
    assert.equal(result.status, 88, "only our non-network psql stub should terminate execution");
  }
});

test("failed local Supabase CLI status fails closed even with inherited local-looking env", () => {
  const { result, psqlInvoked } = exercise(localApi, localDb, true);
  assert.notEqual(result.status, 0);
  assert.equal(psqlInvoked, false);
  assert.match(result.stderr, /No local Supabase stack/);
});
