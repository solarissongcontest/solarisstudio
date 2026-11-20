import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = 'scripts/ops/solaris-role-acl-rehearsal-20261120.sh';
const source = readFileSync(file, 'utf8');

test('the operator-only Bash script parses', () => {
  const lint = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stderr);
});

test('embedded private role-inventory Python parses', () => {
  const start = "<<'PYROLE'\n";
  const end = '\nPYROLE\n';
  assert.equal(source.split(start).length, 2, 'exactly one role Python heredoc');
  assert.equal(source.split(end).length, 2, 'exactly one role Python terminator');
  const snippet = source.split(start)[1].split(end)[0];
  const py = spawnSync('python3', ['-c', 'import ast,sys;ast.parse(sys.stdin.read())'], {
    encoding: 'utf8',
    input: snippet,
  });
  assert.equal(py.status, 0, py.stderr);
});

test('archive ownership/ACLs are NOT intentionally discarded', () => {
  assert.match(source, /pg_restore -U supabase_admin -d postgres/);
  assert.doesNotMatch(source, /--no-owner|--no-acl|--no-privileges/);
  assert.match(source, /--exit-on-error --single-transaction/);
  assert.equal((source.match(/pg_restore -U supabase_admin -d postgres/g) || []).length, 1);
  assert.match(source, /DEFAULT ACL/);
});

test('all PostgreSQL operations are isolated and the ephemeral container is cleaned', () => {
  // Prevent the previously observed invalid literal Docker name ending in "$".
  assert.match(source, /^CONTAINER="solaris-role-acl-test-\$\{BASHPID\}"$/m);
  assert.doesNotMatch(source, /^CONTAINER="[^"]*-\$"$/m);
  assert.match(source, /--name "\$CONTAINER"/);

  assert.match(source, /docker run -d --name "\$CONTAINER" --network none/);
  assert.match(source, /docker run --rm --network none -i/);
  assert.match(source, /listen_addresses=/);
  assert.match(source, /cron\.launch_active_jobs=off/);
  assert.match(source, /test "\$CRON" = off/);
  assert.match(source, /trap cleanup EXIT/);
  assert.match(source, /docker rm -f "\$CONTAINER"/);
  assert.doesNotMatch(source, /--publish|--net=host|--network host|--mount|--volume/);
  assert.doesNotMatch(source, /https?:\/\/[^"'\s]*supabase\.co|DATABASE_URL|SUPABASE_DB_URL|PGHOST=/);
});

test('authorization checks use real role context and fail closed', () => {
  assert.match(source, /SET LOCAL ROLE \$ROLE/);
  assert.match(source, /row_security_active/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /SELECT 1 FROM auth\.users LIMIT 0/);
  assert.match(source, /42501/);
  assert.match(source, /POLICY_COUNT.*265/);
  assert.match(source, /ISOLATED OWNER\/ACL REPLAY AND SCOPED AUTHORIZATION PROBES SUCCESSFUL/);
  assert.match(source, /NOT CERTIFIED: global-role memberships/);
});

test('raw restoration diagnostics and private data are not echoed', () => {
  assert.doesNotMatch(source, /cat "\$KEY"|cat "\$DB"|echo "\$KEY"/);
  assert.doesNotMatch(source, /tail -n.*restore\.private\.log|sed .*restore\.private\.log/);
  assert.match(source, /Full private diagnostics were kept/);
});


test('TOC owner parser requires 225 app, 1 migration ledger and 10 other TABLE entries', () => {
  const snippet = source.split("<<'PYROLE'\n")[1].split('\nPYROLE\n')[0];
  const work = mkdtempSync(join(tmpdir(), 'solaris-role-toc-test-'));
  try {
    const toc = join(work, 'sample.toc');
    const tableLines = Array.from({ length: 225 }, (_, i) =>
      (i + 1) + '; 1259 ' + (1000 + i) +
      ' TABLE public sample_' + (i + 1) + ' postgres');
    const ledger = '226; 1259 9001 TABLE supabase_migrations schema_migrations supabase_admin';
    const extras = Array.from({ length: 10 }, (_, i) =>
      (227 + i) + '; 1259 ' + (2000 + i) +
      ' TABLE other_schema helper_' + (i + 1) + ' supabase_admin');
    const dataLines = Array.from({ length: 225 }, (_, i) =>
      (237 + i) + '; 0 ' + (1000 + i) +
      ' TABLE DATA public sample_' + (i + 1) + ' postgres');
    const unrelated = Array.from({ length: 125 }, (_, i) =>
      (462 + i) + '; 0 ' + (3000 + i) +
      (i % 2 ? ' INDEX public idx_' + i + ' arbitraryvalidowner' + i :
               ' ACL public object_' + i + ' arbitraryvalidowner' + i));
    const unusual = '587; 0 0 ACL public weird-owner!NOT_A_ROLE';
    const makeToc = (tables = tableLines, migration = [ledger], other = extras) =>
      [...tables, ...migration, ...other, ...dataLines, ...unrelated, unusual, ''].join('\n');
    function run(tables, migration, other) {
      writeFileSync(toc, makeToc(tables, migration, other));
      return spawnSync('python3', ['-c', snippet, toc], { encoding: 'utf8' });
    }

    const ok = run(tableLines, [ledger], extras);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stderr, /application=225, ledger=1, other=10, total=236/);
    assert.match(ok.stdout, /CREATE ROLE/);
    assert.doesNotMatch(ok.stdout, /arbitraryvalidowner|NOT_A_ROLE/);

    const badTables = [...tableLines];
    badTables[0] = '1; 1259 1000 TABLE public sample_1 unsafe-owner';
    const unsafe = run(badTables, [ledger], extras);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /unusual TABLE owner field/);
    assert.equal(unsafe.stdout.trim(), '', 'Unsafe owner must emit no SQL');

    for (const [label, tables, migration, other] of [
      ['missing app table', tableLines.slice(1), [ledger], extras],
      ['missing ledger', tableLines, [], extras],
      ['missing extra table', tableLines, [ledger], extras.slice(1)],
      ['unexpected extra table', tableLines, [ledger], [...extras, extras[0]]],
    ]) {
      const res = run(tables, migration, other);
      assert.notEqual(res.status, 0, label);
      assert.match(res.stderr, /unexpected TABLE inventory/, label);
      assert.equal(res.stdout.trim(), '', label + ' must emit no SQL');
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('script has no duplicate or truncated execution bodies', () => {
  for (const pattern of [
    /<<'PYROLE'/g,
    /^PYROLE$/gm,
    /^archive_defines_schema\(\) \{/gm,
    /echo '\[4\/4\]/g,
    /ISOLATED OWNER\/ACL REPLAY AND SCOPED AUTHORIZATION PROBES SUCCESSFUL/g,
    /Production was never contacted; disposable container will now be deleted/g,
  ]) {
    assert.equal([...source.matchAll(pattern)].length, 1,
      'Unexpected duplication of recovery script section: ' + pattern);
  }
  assert.match(source, /if \[ "\$PERMISSION_COMPARISON" != MATCH \]; then[\s\S]*exit 2/);
  assert.match(source, /permissions-restored\.private\.json/);
  assert.match(source, /permission-differences\.private\.json/);
  assert.doesNotMatch(source, /difference is dated drift/);
});
