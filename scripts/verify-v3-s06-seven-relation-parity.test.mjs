import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEVEN, compareSeven } from './verify-v3-s06-seven-relation-parity.mjs';

const hosted = JSON.parse(readFileSync(
  new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json', import.meta.url),
  'utf8'
));
const fixture = () => ({
  pg_version_num: hosted.pg_version_num,
  relations: SEVEN.map(k => structuredClone(
    hosted.relations.find(x => x.schema_name + '.' + x.object_name === k)
  ))
});

test('exact scoped catalog parity is always explicitly noncertified', () => {
  const p = compareSeven(hosted, fixture());
  assert.equal(p.equal, true);
  assert.equal(p.status, 'SEVEN_RELATION_METADATA_PARITY_NOT_CERTIFIED');
  assert.equal(p.independentFixtureRelations, 7);
  assert.equal(p.totalHostedRelations, 215);
  assert.equal(p.totalHostedRoutineIdentities, 727);
  assert.equal(p.remainingUnreconstructedRelationNamesOutsideOriginal56AndThisBatch, 152);
  assert.equal(p.fullHostedEquivalenceCertified, false);
  assert.equal(p.productionMutationsByThisVerifier, 0);
});

test('missing, unexpected and duplicated local physical relations fail closed', () => {
  const missing = fixture(); missing.relations.pop();
  assert.throws(() => compareSeven(hosted, missing), /EXACTLY seven/);
  const extra = fixture(); extra.relations[0].object_name = 'not_hosted';
  assert.throws(() => compareSeven(hosted, extra), /extra\/duplicate/);
  const dup = fixture(); dup.relations[0] = dup.relations[1];
  assert.throws(() => compareSeven(hosted, dup), /extra\/duplicate/);
});

test('definition, ACL, RLS, constraints, indexes and trigger digest drift blocks', () => {
  for (const [field, val] of [
    ['columns_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['acl_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['constraints_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['indexes_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['policies_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['triggers_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    ['rls_enabled',true],
    ['index_count',9]
  ]) {
    const x = fixture();
    x.relations[0][field] = val;
    if (field === 'rls_enabled' && hosted.relations.find(z=>z.schema_name==='private'&&z.object_name==='country_auth_rate_limits').rls_enabled) {
      x.relations[0][field] = false;
    }
    assert.equal(compareSeven(hosted, x).equal, false, 'drift must block: ' + field);
  }
});

test('invalid/missing digest, version and corrupt hosted baseline refuse', () => {
  const x = fixture(); x.relations[0].columns_md5 = 'not_md5';
  assert.throws(() => compareSeven(hosted, x), /invalid digest/);
  const pg = fixture(); pg.pg_version_num = 160000;
  assert.throws(() => compareSeven(hosted, pg), /PG17\.11/);
  const short = structuredClone(hosted); short.relations.pop();
  assert.throws(() => compareSeven(short, fixture()), /215-relation/);
  const noRoutines = structuredClone(hosted); noRoutines.routines = [];
  assert.throws(() => compareSeven(noRoutines, fixture()), /727-routine/);
});

test('never allow a hosted baseline with missing scoped object or new triggering behavior', () => {
  const absent = structuredClone(hosted);
  absent.relations = absent.relations.map(x => structuredClone(x));
  absent.relations.find(x => x.schema_name==='private' && x.object_name==='country_auth_rate_limits').object_name = 'renamed';
  assert.throws(() => compareSeven(absent, fixture()), /baseline contract/);
  const trigger = structuredClone(hosted);
  trigger.relations.find(x => x.schema_name==='private' && x.object_name==='country_auth_rate_limits').trigger_count = 1;
  assert.throws(() => compareSeven(trigger, fixture()), /baseline contract/);
});

test('passing metadata parity has no effect on user data or live database', () => {
  const { disclaimer, productionQueriesByThisVerifier, productionMutationsByThisVerifier,
    reviewerApprovalOutstanding, fullHostedEquivalenceCertified } = compareSeven(hosted, fixture());
  assert.match(disclaimer, /Seven relation fingerprints ONLY/);
  assert.equal(productionQueriesByThisVerifier, 0);
  assert.equal(productionMutationsByThisVerifier, 0);
  assert.equal(reviewerApprovalOutstanding, true);
  assert.equal(fullHostedEquivalenceCertified, false);
});