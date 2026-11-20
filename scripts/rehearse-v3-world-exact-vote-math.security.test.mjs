import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

// The "supabase" and "psql" executables are always stubbed in an isolated PATH.
// These tests never contact Supabase, PostgreSQL or any external host.
const script = resolve(process.cwd(), "scripts/rehearse-v3-world-exact-vote-math.sh");
const root = mkdtempSync(join(tmpdir(), "solaris-tg8-egress-"));
const bin = join(root, "bin");
const marker = join(root, "psql-invoked");
const localAPI = "http://127.0.0.1:54321";
const localDB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

before(() => {
  mkdirSync(bin);
  const supabase = join(bin, "supabase");
  writeFileSync(supabase, '#!/usr/bin/env bash\n' +
    '[[ "$1" == status && "$2" == -o && "$3" == env ]] || exit 33\n' +
    'if [[ -n "$MOCK_STATUS_RAW" ]]; then\n' +
    '  printf "%s\\n" "$MOCK_STATUS_RAW"\n' +
    'else\n' +
    '  printf \'API_URL="%s"\\nDB_URL="%s"\\n\' "$MOCK_API_URL" "$MOCK_DB_URL"\n' +
    'fi\n');
  chmodSync(supabase, 0o755);
  const psql = join(bin, "psql");
  writeFileSync(psql, '#!/usr/bin/env bash\nprintf invoked > "$MOCK_PSQL_MARKER"\n');
  chmodSync(psql, 0o755);
});
after(() => rmSync(root, { recursive: true, force: true }));

function run({ api = localAPI, db = localDB, raw = "" } = {}) {
  rmSync(marker, { force: true });
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      MOCK_API_URL: api,
      MOCK_DB_URL: db,
      MOCK_STATUS_RAW: raw,
      MOCK_PSQL_MARKER: marker,
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { status: result.status, stderr: result.stderr, invoked: existsSync(marker) };
}

test("local IPv4 and localhost status values reach only the psql stub", () => {
  for (const [api, db] of [
    [localAPI, localDB],
    ["http://localhost:54321", "postgres://postgres:postgres@localhost:54322/postgres"],
  ]) {
    const result = run({ api, db });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.invoked, true);
  }
});

test("userinfo disguises cannot send rehearsal traffic to another host", () => {
  for (const [api, db] of [
    ["http://localhost:54321@evil.example", localDB],
    ["http://127.0.0.1:54321@evil.example", localDB],
    [localAPI, "postgresql://postgres:postgres@localhost:54322@evil.example/postgres"],
    [localAPI, "postgres://postgres:postgres@127.0.0.1:54322@evil.example/postgres"],
  ]) {
    const result = run({ api, db });
    assert.notEqual(result.status, 0);
    assert.equal(result.invoked, false);
    assert.match(result.stderr, /Refusing hosted\/non-loopback/);
  }
});

test("Postgres URL query host overrides, fragments and remote hosts are rejected", () => {
  for (const db of [
    localDB + "?host=evil.example",
    localDB + "#host=evil.example",
    "postgresql://postgres:postgres@evil.example:54322/postgres",
    "postgresql://postgres:postgres@localhost/postgres",
    "postgresql://postgres:postgres@localhost:99999/postgres",
    "postgresql://postgres:postgres@localhost:54322/other_database",
    "postgresql://postgres:wrong@localhost:54322/postgres",
  ]) {
    const result = run({ db });
    assert.notEqual(result.status, 0, db);
    assert.equal(result.invoked, false, db);
  }
});

test("non-loopback, malformed and credentialed API URLs are rejected", () => {
  for (const api of [
    "https://127.0.0.1:54321", "http://evil.example:54321",
    "http://localhost:54321?redirect=evil.example",
    "http://localhost:54321/private",
    "http://user@localhost:54321",
    "http://localhost",
    "http://localhost:99999",
  ]) {
    const result = run({ api });
    assert.notEqual(result.status, 0, api);
    assert.equal(result.invoked, false, api);
  }
});

test("Supabase status cannot execute command substitutions", () => {
  const injectedFile = join(root, "unexpected-shell-execution");
  rmSync(injectedFile, { force: true });
  const raw = 'API_URL="' + localAPI + '"\n' +
    'DB_URL="$(touch ' + injectedFile + ')"';
  const result = run({ raw });
  assert.notEqual(result.status, 0);
  assert.equal(result.invoked, false);
  assert.equal(existsSync(injectedFile), false);
});

test("missing or duplicate status assignments fail closed before psql", () => {
  for (const raw of [
    'API_URL="' + localAPI + '"',
    'API_URL="' + localAPI + '"\nDB_URL="' + localDB + '"\nDB_URL="' + localDB + '"',
    'API_URL="' + localAPI + '"\nAPI_URL="http://evil.example:54321"\nDB_URL="' + localDB + '"',
  ]) {
    const result = run({ raw });
    assert.notEqual(result.status, 0);
    assert.equal(result.invoked, false);
  }
});
