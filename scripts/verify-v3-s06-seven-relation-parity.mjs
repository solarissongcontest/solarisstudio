#!/usr/bin/env node
// S06: schema-only digest parity for seven specific hosted-observed relations.
// Local JSON is generated only by PostgreSQL running in a networkless CI container.
// Passing proves ONLY these seven relation catalog fields, NEVER full S06 equivalence.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEVEN = Object.freeze([
  'private.country_auth_rate_limits',
  'private.studio2_platform_exit_write_probe',
  'public.ssc_rule_registry',
  'public.studio2_televote_global_versions',
  'public.studio2_televote_round_versions',
  'televoting.legacy_friend_voting_relationships',
  'televoting.legacy_import_metadata'
]);
const FIELDS = Object.freeze([
  'schema_name','object_name','object_kind','owner_name',
  'rls_enabled','rls_forced','acl_md5',
  'column_count','columns_md5',
  'constraint_count','constraints_md5',
  'index_count','indexes_md5',
  'policy_count','policies_md5',
  'trigger_count','triggers_md5'
]);
const MD5 = /^[a-f0-9]{32}$/;
const COUNTS = ['column_count','constraint_count','index_count','policy_count','trigger_count'];
const DIGESTS = ['acl_md5','columns_md5','constraints_md5','indexes_md5','policies_md5','triggers_md5'];
const id = r => r.schema_name + '.' + r.object_name;

export function compareSeven(hosted, local) {
  if (!hosted || !local || hosted.pg_version_num !== 170011 || local.pg_version_num !== 170011) {
    throw new Error('S06 blocked: PG17.11 baseline/local source mismatch');
  }
  if (!Array.isArray(hosted.relations) || hosted.relations.length !== 215) {
    throw new Error('S06 blocked: frozen 215-relation baseline invalid');
  }
  if (!Array.isArray(hosted.routines) || hosted.routines.length !== 727) {
    throw new Error('S06 blocked: frozen 727-routine identity baseline invalid');
  }
  if (!Array.isArray(local.relations) || local.relations.length !== SEVEN.length) {
    throw new Error('S06 blocked: local fixture must contain EXACTLY seven physical relations');
  }
  const wanted = new Set(SEVEN);
  const frozen = new Map();
  for (const r of hosted.relations) {
    const key = id(r);
    if (frozen.has(key)) throw new Error('S06 blocked: duplicate frozen identity');
    frozen.set(key, r);
  }
  for (const name of SEVEN) {
    const r = frozen.get(name);
    if (!r || r.object_kind !== 'r' || r.policy_count !== 0 || r.trigger_count !== 0) {
      throw new Error('S06 blocked: seven-relation hosted baseline contract changed: ' + name);
    }
  }
  const found = new Map();
  for (const r of local.relations) {
    const key = id(r);
    if (!wanted.has(key) || found.has(key)) {
      throw new Error('S06 blocked: extra/duplicate local table: ' + key);
    }
    found.set(key, r);
  }
  const differences = [];
  for (const name of SEVEN) {
    const expected = frozen.get(name), actual = found.get(name);
    if (!actual) throw new Error('S06 blocked: missing local table: ' + name);
    for (const f of FIELDS) {
      if (DIGESTS.includes(f) &&
          (!MD5.test(expected[f]) || !MD5.test(actual[f]))) {
        throw new Error('S06 blocked: invalid digest: ' + name + '.' + f);
      }
      if (COUNTS.includes(f) &&
          (!Number.isInteger(actual[f]) || actual[f] < 0)) {
        throw new Error('S06 blocked: invalid count: ' + name + '.' + f);
      }
      if (expected[f] !== actual[f]) differences.push(name + '.' + f);
    }
  }
  return {
    task: 'S06',
    status: differences.length ? 'SEVEN_RELATION_CATALOG_MISMATCH_BLOCKED' : 'SEVEN_RELATION_METADATA_PARITY_NOT_CERTIFIED',
    equal: differences.length === 0,
    totalHostedRelations: hosted.relations.length,
    independentFixtureRelations: SEVEN.length,
    totalHostedRoutineIdentities: hosted.routines.length,
    routinesReconstructedByThisFixture: 0,
    mismatches: differences,
    productionQueriesByThisVerifier: 0,
    productionMutationsByThisVerifier: 0,
    fullHostedEquivalenceCertified: false,
    reviewerApprovalOutstanding: true,
    remainingUnreconstructedRelationNamesOutsideOriginal56AndThisBatch: 152,
    disclaimer: 'Seven relation fingerprints ONLY. No function bodies, auth/role memberships, policy semantics, complete schema closure, migration/effect history or production deployment proof.'
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5) {
      throw new Error('Usage: node scripts/verify-v3-s06-seven-relation-parity.mjs <frozen215.json> <local_catalog.json> <new_report.json>');
    }
    const [frozenPath, localPath, reportPath] = process.argv.slice(2);
    const paths = [frozenPath, localPath, reportPath].map(resolve);
    if (new Set(paths).size !== paths.length) throw new Error('Refusing to overwrite evidence inputs');
    const hosted = JSON.parse(readFileSync(frozenPath, 'utf8'));
    const local = JSON.parse(readFileSync(localPath, 'utf8'));
    const report = compareSeven(hosted, local);
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag:'wx', mode:0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (!report.equal) process.exitCode = 1;
  } catch (error) {
    console.error('S06 SEVEN-RELATION parity BLOCKED: ' + error.message);
    process.exitCode = 2;
  }
}
