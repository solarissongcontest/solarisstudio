import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

// Stub executables: no real Supabase, PostgreSQL, DNS, or database traffic.
const target = resolve(process.cwd(), "scripts/rehearse-v3-world-platform-mode.sh");
const root = mkdtempSync(join(tmpdir(), "world-platform-mode-guard-"));
const bin = join(root, "bin");
const marker = join(root, "psql-reached");
const environmentMarker = join(root, "psql-saw-host-override");
const apiLocal = "http://127.0.0.1:54321";
const dbLocal = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

before(() => {
  mkdirSync(bin);
  const supabaseStub = join(bin, "supabase");
  writeFileSync(supabaseStub, [
    "#!/usr/bin/env bash",
    '[[ "$1" == status && "$2" == -o && "$3" == env ]] || exit 13',
    'if [[ -n "${MOCK_STATUS_RAW:-}" ]]; then',
    '  printf "%s\\n" "$MOCK_STATUS_RAW"',
    "else",
    '  printf \'API_URL="%s"\\nDB_URL="%s"\\n\' "$MOCK_API_URL" "$MOCK_DB_URL"',
    "fi",
    "",
  ].join("\n"));
  chmodSync(supabaseStub, 0o755);

  const psqlStub = join(bin, "psql");
  writeFileSync(psqlStub, [
    "#!/usr/bin/env bash",
    'printf invoked > "$MOCK_PSQL_MARKER"',
    'if env | grep -Eq "^PG(HOST|HOSTADDR|SERVICE|PASSWORD|USER|DATABASE)="; then',
    '  printf leaked > "$MOCK_PG_ENV_MARKER"',
    "  exit 31",
    "fi",
    "",
  ].join("\n"));
  chmodSync(psqlStub, 0o755);
});
after(() => rmSync(root, { recursive: true, force: true }));

function run({ api = apiLocal, db = dbLocal, raw = "", extraEnv = {} } = {}) {
  rmSync(marker, { force: true });
  rmSync(environmentMarker, { force: true });
  const result = spawnSync("bash", [target], {
    encoding: "utf8",
    timeout: 12_000,
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      MOCK_API_URL: api,
      MOCK_DB_URL: db,
      MOCK_STATUS_RAW: raw,
      MOCK_PSQL_MARKER: marker,
      MOCK_PG_ENV_MARKER: environmentMarker,
      ...extraEnv,
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return {
    status: result.status,
    stderr: result.stderr,
    invoked: existsSync(marker),
    libpqOverrideLeaked: existsSync(environmentMarker),
  };
}

test("valid loopback IPv4 and localhost reach only the psql stub", () => {
  for (const [api, db] of [
    [apiLocal, dbLocal],
    ["http://localhost:54321", "postgres://postgres:postgres@localhost:54322/postgres"],
  ]) {
    const result = run({ api, db });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.invoked, true);
    assert.equal(result.libpqOverrideLeaked, false);
  }
});

test("malformed or hosted API authorities cannot reach psql", () => {
  for (const api of [
    "http://127.0.0.1:54321@evil.example",
    "http://localhost:54321@evil.example",
    "https://localhost:54321",
    "http://evil.example:54321",
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

test("libpq authority overrides and unexpected database targets are blocked", () => {
  for (const db of [
    dbLocal + "?host=evil.example",
    dbLocal + "?hostaddr=8.8.8.8",
    dbLocal + "?service=production",
    dbLocal + "#ignored-host",
    "postgresql://postgres:postgres@127.0.0.1:54322@evil.example/postgres",
    "postgres://postgres:postgres@evil.example:54322/postgres",
    "postgres://postgres:postgres@localhost:54322/otherdb",
    "postgresql://postgres:incorrect@localhost:54322/postgres",
    "postgresql://postgres:postgres@localhost:99999/postgres",
    "postgresql://postgres:postgres@localhost/postgres",
  ]) {
    const result = run({ db });
    assert.notEqual(result.status, 0, db);
    assert.equal(result.invoked, false, db);
  }
});

test("inherited libpq routing and auth overrides are scrubbed before psql", () => {
  const result = run({
    extraEnv: {
      PGHOST: "evil.example",
      PGHOSTADDR: "8.8.8.8",
      PGSERVICE: "production",
      PGPASSWORD: "not-disposable",
      PGDATABASE: "sensitive",
      PGUSER: "remote",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.invoked, true);
  assert.equal(result.libpqOverrideLeaked, false);
});

test("CLI output never executes injected shell syntax", () => {
  const injectedFile = join(root, "unexpected-command-substitution");
  rmSync(injectedFile, { force: true });
  const raw = 'API_URL="' + apiLocal + '"\n' +
    'DB_URL="$(touch ' + injectedFile + ')"';
  const result = run({ raw });
  assert.notEqual(result.status, 0);
  assert.equal(result.invoked, false);
  assert.equal(existsSync(injectedFile), false);
});

test("missing and duplicate URL status keys fail closed", () => {
  for (const raw of [
    'API_URL="' + apiLocal + '"',
    'DB_URL="' + dbLocal + '"',
    'API_URL="' + apiLocal + '"\nDB_URL="' + dbLocal + '"\nDB_URL="' + dbLocal + '"',
    'API_URL="' + apiLocal + '"\nAPI_URL="http://evil.example:54321"\nDB_URL="' + dbLocal + '"',
  ]) {
    const result = run({ raw });
    assert.notEqual(result.status, 0);
    assert.equal(result.invoked, false);
  }
});
