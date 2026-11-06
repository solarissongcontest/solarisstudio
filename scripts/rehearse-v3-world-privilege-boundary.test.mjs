import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const sourceDir = fileURLToPath(new URL('.', import.meta.url));
const runner = join(sourceDir, 'rehearse-v3-world-privilege-boundary.sh');
const audit = readFileSync(join(sourceDir, 'rehearse-v3-world-privilege-boundary.sql'), 'utf8');

function runStubbed(apiUrl, dbUrl) {
  const dir = mkdtempSync(join(tmpdir(), 'tg19-world-privileges-'));
  const marker = join(dir, 'psql-invoked');
  try {
    const cli = join(dir, 'supabase');
    const psql = join(dir, 'psql');
    // The fake CLI never makes a network request; attacker URLs remain test data.
    writeFileSync(cli, '#!/bin/sh\n' +
      '[ "$1" = status ] && [ "$2" = -o ] && [ "$3" = env ] || exit 2\n' +
      'printf "%s\\n" "API_URL=' + apiUrl + '" "DB_URL=' + dbUrl + '"\n');
    writeFileSync(psql, '#!/bin/sh\n' +
      '[ -z "${PGHOSTADDR:-}" ] && [ -z "${PGSERVICE:-}" ] || exit 97\n' +
      'printf invoked > "$TG19_MARKER_FILE"\n');
    chmodSync(cli, 0o755);
    chmodSync(psql, 0o755);
    const result = spawnSync('bash', [runner], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: dir + ':' + process.env.PATH,
        TG19_MARKER_FILE: marker,
        PGHOSTADDR: 'evil.example',
        PGSERVICE: 'production',
        API_URL: 'https://hosted.example.com',
        DB_URL: 'postgresql://postgres@hosted.example.com/prod',
      },
    });
    return { status: result.status, stderr: result.stderr, calledPsql: existsSync(marker) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const localApi = 'http://127.0.0.1:54321';
const localDb = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

test('TG19 runner rejects fake-local URLs with remote actual hostname', () => {
  for (const [api, db] of [
    ['http://localhost:54321@evil.example', localDb],
    [localApi, 'postgresql://postgres:postgres@localhost:54322@evil.example/postgres'],
    ['http://127.0.0.1.evil.example:54321', localDb],
    [localApi, localDb + '?host=evil.example'],
    [localApi, localDb + '?%68ostaddr=evil.example'],
    ['https://prod.supabase.co', localDb],
  ]) {
    const result = runStubbed(api, db);
    assert.notEqual(result.status, 0, 'unsafe target unexpectedly accepted: ' + api + ' / ' + db);
    assert.equal(result.calledPsql, false, 'psql must never run with an unverified URL');
    assert.match(result.stderr, /loopback-only|FAIL/);
  }
});

test('TG19 runner allows only explicit local status URLs and ignores inherited URLs', () => {
  const result = runStubbed(localApi, localDb);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calledPsql, true);
});

test('TG19 SQL catalog audit is read only and checks every World persistent table', () => {
  assert.match(audit, /set transaction read only;/i);
  assert.match(audit, /c\.relkind in \('r', 'p', 'v', 'm', 'f'\)/);
  assert.match(audit, /left\(c\.relname, 6\) = 'world_'/);
  assert.match(audit, /world_table\.relrowsecurity/);
  assert.match(audit, /world_table\.relkind in \('r', 'p'\)/);
  for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
    assert.ok(audit.includes("'" + privilege + "'"));
  }
  for (const role of ['anon', 'authenticated']) assert.ok(audit.includes("'" + role + "'"));
  assert.match(audit, /TG19_WORLD_PRIVILEGES_NO_WORLD_TABLES/);
  assert.match(audit, /rollback;/i);
  assert.doesNotMatch(audit, /\b(create|alter|drop|truncate|insert|update|delete)\s+(table|view|into|from|public\.)/i);
});
