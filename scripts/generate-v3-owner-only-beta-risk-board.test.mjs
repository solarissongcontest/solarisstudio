import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildOwnerOnlyBetaRiskBoard,
  renderOwnerOnlyBetaRiskBoard,
} from './generate-v3-owner-only-beta-risk-board.mjs';

const sha = 'a'.repeat(40);
const hard = {
  id: 'VOTE-AUTHORITY', capability: 'Critical voting authority',
  classification: 'hard', status: 'blocked', owner: 'System/Voting',
  dependencies: [], relatedPRs: [2404],
  requiredEvidence: ['single governed writer', 'local negative RLS'],
  nextAction: 'test', verificationSha: sha,
};
const conditional = {
  id: 'WORLD-SCOPE', capability: 'World', classification: 'conditional',
  status: 'unverified', owner: 'World/Release',
  dependencies: ['VOTE-AUTHORITY'], relatedPRs: [],
  requiredEvidence: ['disabled/unreachable'], nextAction: 'review', verificationSha: sha,
};
const matrix = {
  schemaVersion: 1, scope: 'full_solaris_studio_v3',
  coverage: 'initial_verified_high_priority_only',
  baselineMainSha: sha, snapshotDate: '2026-11-08',
  items: [hard, conditional],
};
const policy = {
  schemaVersion: 1, scope: 'owner_only_beta',
  requiredPilotFlows: ['Voting'],
  forbiddenOperations: ['Hosted Supabase tests'],
  conditionalReviews: {
    'WORLD-SCOPE': { owner: 'World', pilotNeed: 'Outside proposed pilot', scopeApproved: false },
  },
  trackedDebt: [],
  replacedWork: [{
    id: 'DONOR', owner: 'QA', reason: 'Merged successor',
    replacementUrl: 'https://github.com/solarissongcontest/solarisstudio/pull/2415',
    evidenceUrls: ['https://github.com/solarissongcontest/solarisstudio/pull/2408'],
  }],
  proposedExclusions: [
    { id: 'EXC-WORLD', owner: 'World', verified: false, reason: 'Await rollout evidence' },
  ],
  unknowns: [
    { id: 'UNKNOWN-CI', owner: 'QA', reason: 'Exact SHA evidence not verified' },
  ],
};
const clone = x => JSON.parse(JSON.stringify(x));

test('retains hard blockers and separates incomplete full-V3 inventory from beta scope', () => {
  const b = buildOwnerOnlyBetaRiskBoard(matrix, policy, sha);
  assert.equal(b.decision, 'NOT_CERTIFIED');
  assert.equal(b.fullV3Matrix.coverage, 'initial_verified_high_priority_only');
  assert.equal(b.counts.hardUnresolved, 1);
  assert.equal(b.rows.find(x => x.id === hard.id).pilotClass, 'hard');
  assert.equal(b.counts.conditionalPending, 1);
  assert.equal(b.counts.verifiedConditionalExclusions, 0);
  assert.equal(b.counts.replacedWork, 1);
  assert.ok(renderOwnerOnlyBetaRiskBoard(b).includes('NOT CERTIFIED'));
  assert.ok(renderOwnerOnlyBetaRiskBoard(b).includes('No item is safely evidenced as beta debt'));
});

test('a false excluded claim cannot downgrade an integrity-critical hard blocker', () => {
  const p = clone(policy);
  p.conditionalReviews['VOTE-AUTHORITY'] = {
    owner: 'QA', pilotNeed: 'Try to waive voting', scopeApproved: true,
    disabledAndUnreachableVerified: true, noCanonicalMutationVerified: true,
    verifiedSha: sha,
    evidenceUrls: ['https://github.com/solarissongcontest/solarisstudio/pull/1'],
  };
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, p, sha), /override attempt/);
});

test('conditional exclusions require approval, disabled and nonmutation proof at exact SHA', () => {
  const p = clone(policy);
  p.conditionalReviews['WORLD-SCOPE'] = {
    ...p.conditionalReviews['WORLD-SCOPE'], scopeApproved: true,
    disabledAndUnreachableVerified: true, noCanonicalMutationVerified: false,
    verifiedSha: sha,
    evidenceUrls: ['https://github.com/solarissongcontest/solarisstudio/pull/1'],
  };
  assert.equal(buildOwnerOnlyBetaRiskBoard(matrix, p, sha).counts.conditionalPending, 1);
  p.conditionalReviews['WORLD-SCOPE'].noCanonicalMutationVerified = true;
  p.conditionalReviews['WORLD-SCOPE'].verifiedSha = 'b'.repeat(40);
  assert.equal(buildOwnerOnlyBetaRiskBoard(matrix, p, sha).counts.conditionalPending, 1);
  p.conditionalReviews['WORLD-SCOPE'].verifiedSha = sha;
  assert.equal(buildOwnerOnlyBetaRiskBoard(matrix, p, sha).counts.verifiedConditionalExclusions, 1);
});

test('rejects unsafe debt, unproved replacement and forged exclusions', () => {
  const p = clone(policy);
  p.trackedDebt = [{
    id: 'DEBT', owner: 'QA', reason: 'unfinished critical vote path',
    reviewBy: '2026-11-15',
    evidenceUrls: ['https://github.com/solarissongcontest/solarisstudio/issues/574'],
    safetyCritical: true,
  }];
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, p, sha), /Safety-critical/);
  p.trackedDebt = [];
  p.replacedWork[0].evidenceUrls = [];
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, p, sha), /proven successor/);
  p.replacedWork = clone(policy.replacedWork);
  p.proposedExclusions[0].verified = true;
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, p, sha), /masquerade/);
});

test('fails closed on missing reviews, invalid SHA or dependency omissions', () => {
  const p = clone(policy);
  delete p.conditionalReviews['WORLD-SCOPE'];
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, p, sha), /Missing explicit conditional/);
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(matrix, policy, 'stale'), /Full exact/);
  const m = clone(matrix);
  m.items[1].dependencies = ['ABSENT'];
  assert.throws(() => buildOwnerOnlyBetaRiskBoard(m, policy, sha), /Unresolved dependency/);
});

test('canonical owner-only policy forbids hosted tests and has no fake exclusions', () => {
  const p = JSON.parse(readFileSync(new URL('../docs/v3/owner-only-beta-risk-scope.json', import.meta.url)));
  assert.equal(Object.keys(p.conditionalReviews).length, 5);
  assert.ok(p.forbiddenOperations.some(x => /hosted database migration/i.test(x)));
  assert.ok(p.forbiddenOperations.some(x => /automated tests.*hosted Supabase/i.test(x)));
  assert.ok(p.proposedExclusions.every(x => x.verified === false));
  assert.ok(p.conditionalReviews['PUBLIC-PARITY'].pilotNeed.includes('Jury'));
});


test('live source matrix projects all rows without downgrading a hard blocker', () => {
  const actualMatrix = JSON.parse(readFileSync(
    new URL('../docs/v3/final-week-release-blocker-matrix.json', import.meta.url)));
  const actualPolicy = JSON.parse(readFileSync(
    new URL('../docs/v3/owner-only-beta-risk-scope.json', import.meta.url)));
  const board = buildOwnerOnlyBetaRiskBoard(actualMatrix, actualPolicy, sha);
  assert.equal(board.rows.length, actualMatrix.items.length);
  assert.deepEqual(
    board.rows.filter(x => x.pilotClass === 'hard').map(x => x.id).sort(),
    actualMatrix.items.filter(x => x.classification === 'hard').map(x => x.id).sort(),
  );
  assert.equal(board.counts.hardUnresolved,
    actualMatrix.items.filter(x => x.classification === 'hard' && x.status !== 'closed').length);
  assert.equal(board.counts.verifiedConditionalExclusions, 0);
  assert.equal(board.decision, 'NOT_CERTIFIED');
  assert.ok(board.unknowns.some(x => x.id === 'UNKNOWN-BETA-ACCESS'));
});
