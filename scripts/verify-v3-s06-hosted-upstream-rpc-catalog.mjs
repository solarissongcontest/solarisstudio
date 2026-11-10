#!/usr/bin/env node
// Verify a networkless local PG17.11 fixture against a bounded, read-only
// hosted catalog snapshot. Never execute this script against hosted SQL.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const root = process.cwd();
const evidencePath = 'docs/v3/recovery-candidates/evidence/s06-hosted-upstream-rpc-fingerprints-20261110.json';
const candidatePath = 'docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql';
const catalogPath = 'scripts/v3-s06-hosted-upstream-rpc-catalog-local.sql';
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
const source = readFileSync(candidatePath, 'utf8');
const query = readFileSync(catalogPath, 'utf8');
const mandatoryStart = source.indexOf('-- Mandatory runtime dependencies');
const mandatoryEnd = source.indexOf('-- These are the source-owned', mandatoryStart);
assert.ok(mandatoryStart > 0 && mandatoryEnd > mandatoryStart, 'Cannot locate canonical S06 preflight');
const required = [...source.slice(mandatoryStart, mandatoryEnd)
  .matchAll(/'((?:private|public)\.[a-z0-9_]+\([^']*\))'/g)]
  .map(match => match[1]).sort();
const recorded = evidence.functions.map(row => row.identity).sort();
const probed = [...query.matchAll(/\('((?:private|public)\.[^']+)'\)/g)]
  .map(match => match[1]).sort();
assert.equal(required.length, 21, 'S06 source no longer declares exactly 21 upstream RPCs');
assert.equal(new Set(required).size, 21, 'Duplicate source RPC');
assert.deepEqual(recorded, required, 'Snapshot diverges from S06 source preflight');
assert.deepEqual(probed, required, 'Local pg_catalog probe diverges from source preflight');
assert.equal(evidence.postgresVersion, '17.11', 'Expected PostgreSQL version changed');

const fields = ['definition_md5', 'owner', 'security_definer', 'strict',
  'volatility', 'parallel', 'acl', 'config'];
function verifyRows(actual) {
  assert.ok(Array.isArray(actual), 'Catalog output must be an array');
  assert.equal(actual.length, 21, 'Missing or extra upstream RPC');
  const seen = new Set();
  const byName = new Map(evidence.functions.map(row => [row.identity, row]));
  for (const row of actual) {
    assert.ok(row && typeof row === 'object', 'Null RPC catalog row');
    assert.ok(!seen.has(row.identity), 'Duplicate RPC ' + row.identity);
    seen.add(row.identity);
    const expected = byName.get(row.identity);
    assert.ok(expected, 'Unknown RPC ' + row.identity);
    for (const field of fields) {
      assert.deepEqual(row[field], expected[field],
        'Hosted-observed ' + row.identity + ' ' + field + ' drift');
    }
    assert.match(row.definition_md5, /^[0-9a-f]{32}$/, 'Invalid definition fingerprint');
  }
  assert.equal(seen.size, 21);
}

// Confirm every enforced signal independently fails closed on a synthetic
// mutation. These altered objects exist ONLY in memory, never in PostgreSQL.
for (const field of fields) {
  const copy = structuredClone(evidence.functions);
  copy[0][field] = field === 'security_definer' || field === 'strict'
    ? !copy[0][field] : 'S06_SYNTHETIC_DRIFT';
  assert.throws(() => verifyRows(copy), /drift|fingerprint/,
    'Verifier accepted mutated ' + field);
}
const absent = structuredClone(evidence.functions).slice(1);
assert.throws(() => verifyRows(absent), /Missing or extra/);
const duplicated = structuredClone(evidence.functions);
duplicated[1].identity = duplicated[0].identity;
assert.throws(() => verifyRows(duplicated), /Duplicate RPC/);
const extra = structuredClone(evidence.functions);
extra[0].identity = 'private.unknown_s06()';
assert.throws(() => verifyRows(extra), /Unknown RPC/);

if (process.argv[2] === '--self-test') {
  console.log('PASS: S06 21-upstream source/probe parity and 11 synthetic fail-closed cases');
  process.exit(0);
}
assert.ok(process.argv[2], 'Usage: node verifier.mjs <local-pg-json> [proof.json]');
const actual = JSON.parse(readFileSync(process.argv[2], 'utf8').trim());
verifyRows(actual);
if (process.argv[3]) {
  const result = {
    source: evidencePath,
    sourceCandidate: candidatePath,
    target: 'networkless-disposable-PG17.11',
    reviewedSha: process.env.EXACT_SHA || 'local-unpinned',
    checkedUpstreamRpcs: 21,
    checks: fields,
    result: 'PASS',
    limitations: 'Only 21 upstream metadata fingerprints; no production rows, full 727 RPC dependency/runtime parity or 215-table equivalence'
  };
  writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
}
console.log('PASS: 21 required hosted-observed upstream RPC definitions, owner, privileges and security flags match isolated PG17.11');
