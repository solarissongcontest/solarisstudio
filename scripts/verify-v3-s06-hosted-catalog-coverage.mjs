#!/usr/bin/env node
// S06 catalog-only coverage verifier. Never connects to any database/network.
// Matching metadata is necessary, NOT sufficient, for hosted-equivalent recovery.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMAS = new Set(['auth', 'public', 'private', 'televoting']);
const EXPECTED = Object.freeze({ relations: 215, columns: 2364, routines: 727, schemas: 4, pg: 170011 });
const SHA32 = /^[a-f0-9]{32}$/;
const FIELDS = Object.freeze({
  schemas: ['schema_name', 'owner_name', 'acl_md5'],
  relations: [
    'schema_name', 'object_name', 'object_kind', 'owner_name', 'rls_enabled',
    'rls_forced', 'acl_md5', 'column_count', 'columns_md5',
    'constraint_count', 'constraints_md5', 'index_count', 'indexes_md5',
    'policy_count', 'policies_md5', 'trigger_count', 'triggers_md5',
  ],
  routines: [
    'schema_name', 'object_name', 'signature', 'object_kind', 'owner_name',
    'security_definer', 'strict', 'leakproof', 'volatility', 'parallel',
    'return_type', 'definition_md5', 'acl_md5', 'settings_md5',
  ],
});
const DIGESTS = Object.freeze({
  schemas: ['acl_md5'],
  relations: ['acl_md5', 'columns_md5', 'constraints_md5', 'indexes_md5', 'policies_md5', 'triggers_md5'],
  routines: ['definition_md5', 'acl_md5', 'settings_md5'],
});
const COUNTS = ['column_count', 'constraint_count', 'index_count', 'policy_count', 'trigger_count'];

function id(kind, item) {
  return kind === 'schemas' ? item.schema_name
    : kind === 'relations' ? item.schema_name + '.' + item.object_name
      : item.signature;
}

export function inspectManifest(doc, { frozen = false } = {}) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw Error('Catalog must be an object');
  const allowedRoot = new Set(['pg_version_num', 'schemas', 'relations', 'routines', 'evidence']);
  for (const k of Object.keys(doc)) if (!allowedRoot.has(k)) throw Error('Unexpected catalog field: ' + k);
  if (!Number.isInteger(doc.pg_version_num)) throw Error('Catalog PostgreSQL version is missing');
  const seen = {};
  for (const kind of ['schemas', 'relations', 'routines']) {
    if (!Array.isArray(doc[kind])) throw Error('Catalog missing ' + kind + ' array');
    const keys = new Set(FIELDS[kind]), ids = new Set();
    for (const item of doc[kind]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid ' + kind + ' item');
      if (!SCHEMAS.has(item.schema_name)) throw Error('Out-of-scope schema: ' + String(item.schema_name));
      for (const key of keys) if (!(key in item)) throw Error('Missing ' + kind + '.' + key);
      for (const key of Object.keys(item)) if (!keys.has(key)) throw Error('Unexpected ' + kind + '.' + key);
      for (const key of DIGESTS[kind]) if (typeof item[key] !== 'string' || !SHA32.test(item[key]))
        throw Error('Invalid MD5 digest in ' + kind + '.' + key);
      if (kind === 'relations') {
        if (!['r', 'p'].includes(item.object_kind)) throw Error('Not a physical relation');
        for (const key of COUNTS) if (!Number.isInteger(item[key]) || item[key] < 0)
          throw Error('Invalid relation count field: ' + key);
        if (typeof item.rls_enabled !== 'boolean' || typeof item.rls_forced !== 'boolean')
          throw Error('RLS state must be boolean');
      }
      if (kind === 'routines') {
        if (item.object_kind !== 'f' || !item.signature.startsWith(item.schema_name + '.'))
          throw Error('Invalid routine identity');
        for (const key of ['security_definer', 'strict', 'leakproof'])
          if (typeof item[key] !== 'boolean') throw Error('Invalid routine security state: ' + key);
      }
      const identity = id(kind, item);
      if (!identity || ids.has(identity)) throw Error('Duplicate or empty ' + kind + ' identity: ' + identity);
      ids.add(identity);
    }
    seen[kind] = ids;
  }
  if (seen.schemas.size !== 4 || [...SCHEMAS].some(s => !seen.schemas.has(s)))
    throw Error('Four expected schema namespace identities are required');
  const summary = {
    pg: doc.pg_version_num,
    schemas: doc.schemas.length,
    relations: doc.relations.length,
    columns: doc.relations.reduce((sum, r) => sum + r.column_count, 0),
    routines: doc.routines.length,
  };
  if (frozen && Object.entries(EXPECTED).some(([k, v]) => summary[k] !== v))
    throw Error('Hosted fingerprint baseline size drift: ' + JSON.stringify(summary));
  return summary;
}

export function compareCatalog(expected, observed) {
  const expectedTotals = inspectManifest(expected, { frozen: true });
  const actualTotals = inspectManifest(observed);
  const problems = [];
  if (actualTotals.pg !== expectedTotals.pg) problems.push('postgres_version');
  for (const kind of ['schemas', 'relations', 'routines']) {
    const want = new Map(expected[kind].map(item => [id(kind, item), item]));
    const got = new Map(observed[kind].map(item => [id(kind, item), item]));
    for (const key of want.keys()) if (!got.has(key)) problems.push(kind + '.missing.' + key);
    for (const key of got.keys()) if (!want.has(key)) problems.push(kind + '.unexpected.' + key);
    for (const [key, a] of want) {
      const z = got.get(key);
      if (!z) continue;
      for (const field of FIELDS[kind]) {
        if (a[field] !== z[field]) problems.push(kind + '.mismatch.' + key + '.' + field);
      }
    }
  }
  for (const key of ['relations', 'columns', 'routines', 'schemas'])
    if (expectedTotals[key] !== actualTotals[key]) problems.push('count.' + key);
  return {
    status: problems.length ? 'S06_CATALOG_COVERAGE_BLOCKED' : 'METADATA_PARITY_ONLY_NOT_CERTIFIED',
    equal: problems.length === 0,
    expected: expectedTotals,
    observed: actualTotals,
    mismatches: problems.length,
    first_mismatches: problems.slice(0, 40),
    disclaimer: 'Does not prove row-dependent behavior, complete function call graph, role membership, data distributions, migration history, or production rollout safety.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [frozenPath, observedPath] = process.argv.slice(2);
  if (!frozenPath || !observedPath || resolve(frozenPath) === resolve(observedPath)) {
    console.error('Usage: node scripts/verify-v3-s06-hosted-catalog-coverage.mjs <frozen-hosted.json> <independent-local-catalog.json>');
    process.exitCode = 2;
  } else {
    try {
      const expected = JSON.parse(readFileSync(frozenPath, 'utf8'));
      const observed = JSON.parse(readFileSync(observedPath, 'utf8'));
      const report = compareCatalog(expected, observed);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.equal ? 0 : 1;
    } catch (error) {
      console.error('S06_CATALOG_COVERAGE_BLOCKED: ' + error.message);
      process.exitCode = 2;
    }
  }
}
