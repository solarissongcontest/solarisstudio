import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareCatalog, inspectManifest } from './verify-v3-s06-hosted-catalog-coverage.mjs';

const baseline = JSON.parse(readFileSync(
  new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json', import.meta.url),
  'utf8'
));
const copy = () => structuredClone(baseline);

test('hosted catalog baseline has 215 physical relations, 2364 columns and 727 functions', () => {
  assert.deepEqual(inspectManifest(baseline, { frozen: true }), {
    pg: 170011, schemas: 4, relations: 215, columns: 2364, routines: 727,
  });
});
test('equal independent-shaped snapshots prove metadata parity but never certification', () => {
  const result = compareCatalog(baseline, copy());
  assert.equal(result.equal, true);
  assert.equal(result.status, 'METADATA_PARITY_ONLY_NOT_CERTIFIED');
  assert.match(result.disclaimer, /migration history/);
});
test('missing unmodeled relations are not silently tolerated', () => {
  const local = copy();
  local.relations.pop();
  const result = compareCatalog(baseline, local);
  assert.equal(result.equal, false);
  assert.match(result.first_mismatches.join(' '), /relations\.missing/);
});
test('missing upstream functions block the full fixture gate', () => {
  const local = copy();
  local.routines.pop();
  assert.match(compareCatalog(baseline, local).status, /BLOCKED/);
});
test('column count and fingerprint drift are independently detected', () => {
  const local = copy();
  local.relations[0].column_count++;
  local.relations[0].columns_md5 = '0'.repeat(32);
  const out = compareCatalog(baseline, local);
  assert.equal(out.equal, false);
  assert.ok(out.first_mismatches.some(s => s.endsWith('.column_count')));
  assert.ok(out.first_mismatches.some(s => s.endsWith('.columns_md5')));
});
test('RLS/privilege/index/constraint/trigger changes fail closed', () => {
  for (const field of ['rls_enabled', 'acl_md5', 'indexes_md5', 'constraints_md5', 'triggers_md5', 'policies_md5']) {
    const local = copy();
    local.relations[0][field] = field === 'rls_enabled'
      ? !local.relations[0][field] : '0'.repeat(32);
    assert.ok(!compareCatalog(baseline, local).equal, 'should reject ' + field);
  }
});
test('function definition, ownership and invocation configuration changes fail closed', () => {
  for (const field of ['definition_md5', 'owner_name', 'acl_md5', 'settings_md5', 'security_definer']) {
    const local = copy();
    local.routines[0][field] = field === 'security_definer'
      ? !local.routines[0][field]
      : field === 'owner_name' ? 'synthetic_other_owner' : '0'.repeat(32);
    assert.ok(!compareCatalog(baseline, local).equal, 'should reject ' + field);
  }
});
test('PostgreSQL major/patch version change is detected', () => {
  const local = copy();
  local.pg_version_num = 170012;
  assert.ok(compareCatalog(baseline, local).first_mismatches.includes('postgres_version'));
});
test('duplicate routine/table identities are rejected even with matching counts elsewhere', () => {
  const local = copy();
  local.routines[1] = local.routines[0];
  assert.throws(() => inspectManifest(local), /Duplicate/);
});
test('unknown contents or unhashed sensitive payloads cannot silently enter a manifest', () => {
  const local = copy();
  local.relations[0].production_rows = [{ secret: 'never permitted' }];
  assert.throws(() => inspectManifest(local), /Unexpected/);
});
test('out-of-scope schema and invalid digest are rejected', () => {
  const a = copy();
  a.relations[0].schema_name = 'other';
  assert.throws(() => inspectManifest(a), /Out-of-scope/);
  const b = copy();
  b.routines[0].definition_md5 = 'not-a-fingerprint';
  assert.throws(() => inspectManifest(b), /Invalid MD5/);
});
