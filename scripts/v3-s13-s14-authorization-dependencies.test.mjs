import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dependencies, extractDefinition, expectedContract, reconstructionSql, recoveryManifest, sourceDerivedStrictDualDefinition, sourceDerivedAuthRoleDefinition } from './v3-s13-s14-authorization-dependencies.mjs';
import { validateFreshSource } from './check-v3-s02-baseline.mjs';
const read = p => readFileSync(p, 'utf8');
const sha = '1'.repeat(40);
function catalog() {
  const nodes = dependencies.map((d, i) => {
    const c = expectedContract(d);
    return { id: 'f:' + i, kind: 'function', name: d.name, schema: 'private', identity: d.identity,
      owner: c.owner_name, securityDefiner: c.security_definer, language: (i === 2 || i === 4) ? 'plpgsql' : 'sql',
      definitionSha256: c.definition_sha256, settingsMd5: c.settings_md5, aclMd5: c.acl_md5,
      privileges: { anon: false, authenticated: false, service_role: false }, runtimeCalls: 0 };
  });
  for (const [i, name] of ['public.studio2_access_allowed', 'private.studio2_task_recipient_eligible'].entries())
    nodes.push({ ...nodes[0], id: 'root:' + i, name, identity: name + '()', schema: name.split('.')[0] });
  return { formatVersion: 1, serverVersionNum: 170011, baselineProfile: 'hosted-observed-recovery-subset',
    networkIsolation: { networkMode: 'none', publishedPorts: [] }, databaseImage: 'sha256:' + 'a'.repeat(64),
    nodes, edges: nodes.slice(0, dependencies.length).map(n => ({ source: 'root:0', target: n.id, kind: 'qualified-reference' })) };
}
test('extracts exactly the immutable function body, not migration data changes or siblings', () => {
  for (const d of dependencies) {
    const body = extractDefinition(read(d.source), d.name);
    assert.ok(body.toLowerCase().startsWith('create or replace function ' + d.name));
    assert.equal((body.match(/create or replace function/gi) || []).length, 1);
    assert.ok(read(d.source).includes(body));
    assert.match(expectedContract(d).definition_sha256, /^[a-f0-9]{64}$/);
  }
});
test('hosted auth.role() is source-derived from the frozen auth.uid() fixture', () => {
  const role = sourceDerivedAuthRoleDefinition();
  const pgDefinition = role.replace(/;$/, '') + '\n';
  assert.equal(createHash('md5').update(pgDefinition).digest('hex'),
    '8a3e05459e07e0633d43c6fba2a2cdf4');
  assert.equal(createHash('sha256').update(pgDefinition).digest('hex'),
    'c96a9358b02089b03f3962fd85c5f83c9d64f32240481915c0efe74398dc761b');
  const sql = reconstructionSql();
  assert.match(sql, /Hosted auth role helper contract mismatch/);
  assert.match(sql, /supabase_auth_admin/);
  assert.match(sql, /dashboard_user/);
  assert.match(sql, /879a0ead5da3e8d4e349768dff681d4d/);
});

test('authorized strict-dual body is SOURCE-DERIVED and byte-matches frozen hosted prosrc', () => {
  const strictDual = dependencies.find(d => d.name === 'private.studio2_require_strict_dual');
  assert.ok(strictDual, 'Strict-dual must be a guarded dependency, not a stub');
  const derived = sourceDerivedStrictDualDefinition(strictDual);
  const source = extractDefinition(read(strictDual.source), strictDual.name);
  assert.notEqual(derived, source, 'Raw later source cannot silently replace hosted body');
  const quoted = /\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1;/i.exec(derived);
  assert.ok(quoted);
  assert.equal(createHash('md5').update(quoted[2]).digest('hex'),
    '294d562ce20e3de09ea864b3359b97d6');
  assert.match(expectedContract(strictDual).definition_sha256, /^fd29f6aa3d37caf0c4052305ef6fbf45c99b6aefc9e87ec6a84fb848822d1b11$/);
  assert.match(reconstructionSql(), /private\.studio2_require_strict_dual\(text,uuid,text\)/);
  assert.doesNotMatch(reconstructionSql(), /disable trigger|session_replication_role|drop function/i);
});

test('ambiguous or missing source never picks a default definition', () => {
  const d = dependencies[0], s = extractDefinition(read(d.source), d.name);
  assert.throws(() => extractDefinition('', d.name), /absent/);
  assert.throws(() => extractDefinition(s + '\n' + s, d.name), /Ambiguous/);
});
test('only the exact local placeholder can be replaced, with atomic observed metadata checks', () => {
  const sql = reconstructionSql();
  assert.match(sql, /^-- GENERATED LOCAL-ONLY/);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /p.proacl is null/);
  assert.match(sql, /btrim\(p.prosrc\)=/);
  assert.match(sql, /Authorization dependency already exists/);
  assert.match(sql, /Hosted authorization contract mismatch/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.doesNotMatch(sql, /disable trigger|session_replication_role|supabase_migrations|drop function/i);
});
test('manifest keeps five verified leaves separate from unknown closure and deployment', () => {
  const c = catalog();
  c.nodes.push({ id: 'u:missing', kind: 'unresolved-reference', schema: 'private', identity: 'private.missing' });
  c.edges.push({ source: 'root:0', target: 'u:missing', kind: 'unresolved-qualified-reference' });
  const m = recoveryManifest(c, sha);
  assert.equal(m.reconstructed.length, 5);
  assert.ok(m.remainingInspection.some(x => x.identity === 'private.missing'));
  assert.equal(m.fullHostedEquivalenceCertified, false);
  assert.equal(m.productionRecoveryEligible, false);
  assert.equal(m.extensionEvidence.hosted, null);
  assert.equal(m.extensionEvidence.status, 'UNKNOWN / BLOCKING');
  assert.equal(m.deploymentAuthorized, false);
  assert.equal(m.runtimeCoverage.editionScopedAcceptance, 'PENDING_EXACT_HEAD_LOCAL_RUNTIME_LOG');
  assert.equal(m.runtimeCoverage.executionResult, 'NOT_ATTESTED_BY_THIS_METADATA_MANIFEST');
  assert.equal(m.blockedRuntime.length, 0);
  assert.equal(m.verifiedRuntimeBody[0].identity, 'private.studio2_require_strict_dual(text,uuid,text)');
  assert.equal(m.verifiedRuntimeBody[0].rawHostedDefinitionCommitted, false);
});
test('owner, body, settings and effective execute drift block reconstructed classification', () => {
  for (const patch of [{ owner: 'authenticated' }, { definitionSha256: '0'.repeat(64) },
    { settingsMd5: '0'.repeat(32) }, { privileges: { anon: true, authenticated: false, service_role: false } }]) {
    const c = catalog(); Object.assign(c.nodes[0], patch);
    assert.throws(() => recoveryManifest(c, sha), /Reconstructed dependency drift/);
  }
});
test('unknown version, provenance or candidate fails closed', () => {
  for (const patch of [{ serverVersionNum: 170006 }, { baselineProfile: 'source-defined' },
    { networkIsolation: { networkMode: 'bridge', publishedPorts: [] } }, { databaseImage: 'unknown' }])
    assert.throws(() => recoveryManifest({ ...catalog(), ...patch }, sha));
  assert.throws(() => recoveryManifest(catalog(), 'main'));
});
test('emitted dependency identities and edges are reproducible across OID allocation', () => {
  const first = catalog(), second = structuredClone(first);
  const changed = new Map(second.nodes.map((n, i) => [n.id, 'other-oid:' + (9000 + i)]));
  second.nodes.forEach(n => { n.id = changed.get(n.id); });
  second.edges.forEach(e => { e.source = changed.get(e.source); e.target = changed.get(e.target); });
  const a = recoveryManifest(first, sha), b = recoveryManifest(second, sha);
  assert.deepEqual(a.nodes, b.nodes);
  assert.deepEqual(a.edges, b.edges);
  assert.equal(a.inspectionPolicy.separatelyAuthorizedOperatorOnly, true);
});
test('subset collection does not invent history, seed counts or a pgcrypto dependency', () => {
  const collector = read('scripts/v3-s02-runtime-dependencies-local.sql');
  assert.match(collector, /recovery_subset/);
  assert.match(collector, /"migrationVersions":null,"seedCounts":null/);
  assert.match(collector, /encode\(pg_catalog\.sha256\(pg_catalog\.convert_to/);
  assert.doesNotMatch(collector, /extensions\.digest|create table|insert into/i);
  assert.throws(() => validateFreshSource({ serverVersionNum: 170011, migrationVersions: null, seedCounts: null }, []), /history mismatch/);
});
