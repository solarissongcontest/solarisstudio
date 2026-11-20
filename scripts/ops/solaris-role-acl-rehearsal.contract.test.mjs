import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

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
