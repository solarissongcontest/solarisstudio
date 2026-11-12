#!/usr/bin/env node
// A07: source-only pilot release-risk projection. NOT a release gate or approval.
// The complete full-V3 authority remains check-v3-final-week-blockers.mjs.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHA = /^[a-f0-9]{40}$/;
const GITHUB = 'https://github.com/solarissongcontest/solarisstudio';
const nonempty = x => typeof x === 'string' && x.trim().length > 0;

export function buildOwnerOnlyBetaRiskBoard(matrix, policy, sourceSha) {
  if (!SHA.test(sourceSha)) throw new Error('Full exact checkout SHA required');
  if (!matrix || matrix.schemaVersion !== 1 ||
      matrix.scope !== 'full_solaris_studio_v3' ||
      !Array.isArray(matrix.items) || !matrix.items.length) {
    throw new Error('Canonical full-V3 blocker matrix is missing or malformed');
  }
  if (!policy || policy.schemaVersion !== 1 || policy.scope !== 'owner_only_beta' ||
      !Array.isArray(policy.unknowns) || !Array.isArray(policy.replacedWork) ||
      !Array.isArray(policy.trackedDebt) || !Array.isArray(policy.proposedExclusions) ||
      !policy.conditionalReviews || typeof policy.conditionalReviews !== 'object') {
    throw new Error('Owner-only scope policy is missing or malformed');
  }
  const ids = new Set();
  const rows = [];
  for (const item of matrix.items) {
    if (!nonempty(item.id) || ids.has(item.id) || !nonempty(item.owner) ||
        !Array.isArray(item.dependencies) || !Array.isArray(item.requiredEvidence) ||
        !Array.isArray(item.relatedPRs)) {
      throw new Error('Malformed/duplicate canonical matrix item: ' + String(item && item.id));
    }
    ids.add(item.id);
    if (!['hard', 'conditional', 'debt', 'superseded'].includes(item.classification)) {
      throw new Error('Unknown canonical risk classification: ' + item.id);
    }
    const review = policy.conditionalReviews[item.id];
    if (item.classification === 'conditional' &&
        (!review || !nonempty(review.pilotNeed) || !nonempty(review.owner))) {
      throw new Error('Missing explicit conditional scope review: ' + item.id);
    }
    if (item.classification !== 'conditional' && review) {
      throw new Error('Unexpected classification override attempt: ' + item.id);
    }
    // The same exact checkout and independently reviewed feature/RPC isolation are
    // required for an exclusion. A simple "outside pilot" label is never proof.
    const verifiedExclusion = item.classification === 'conditional' &&
      review.scopeApproved === true && review.disabledAndUnreachableVerified === true &&
      review.noCanonicalMutationVerified === true && review.verifiedSha === sourceSha &&
      Array.isArray(review.evidenceUrls) && review.evidenceUrls.length > 0 &&
      review.evidenceUrls.every(x => typeof x === 'string' && x.startsWith(GITHUB + '/'));
    const pilotClass = item.classification === 'hard' ? 'hard' :
      item.classification === 'conditional' ?
        (verifiedExclusion ? 'excluded_conditional' : 'conditional') :
      item.classification === 'debt' ? 'tracked_debt' : 'replaced';
    if (item.classification === 'superseded' &&
        (!nonempty(item.replacementEvidence) || item.status !== 'superseded')) {
      throw new Error('Replaced work lacks evidence: ' + item.id);
    }
    rows.push({
      id: item.id, capability: item.capability, pilotClass,
      fullV3Class: item.classification, status: item.status,
      pilotNeed: review ? review.pilotNeed : null,
      exclusionVerified: Boolean(verifiedExclusion), owner: item.owner,
      dependencies: item.dependencies, relatedPRs: item.relatedPRs,
      requiredEvidence: item.requiredEvidence, nextAction: item.nextAction,
      inspectedSourceSha: item.verificationSha || null,
      note: item.classification === 'conditional' && !verifiedExclusion ?
        'In-scope or exclusion unverified; not waived by owner-only label.' : null,
    });
  }
  for (const row of rows) for (const dep of row.dependencies) {
    if (!ids.has(dep)) throw new Error('Unresolved dependency ' + row.id + ' -> ' + dep);
  }
  for (const id of Object.keys(policy.conditionalReviews)) {
    if (!ids.has(id)) throw new Error('Scope review references missing canonical item: ' + id);
  }
  for (const item of [].concat(policy.unknowns, policy.trackedDebt,
       policy.replacedWork, policy.proposedExclusions)) {
    if (!nonempty(item.id) || !nonempty(item.owner) || !nonempty(item.reason)) {
      throw new Error('Unowned or unjustified supplementary risk entry');
    }
  }
  for (const item of policy.trackedDebt) {
    if (!nonempty(item.reviewBy) || !Array.isArray(item.evidenceUrls) ||
        !item.evidenceUrls.length) throw new Error('Tracked debt needs review date and evidence');
    if (item.safetyCritical === true) throw new Error('Safety-critical work cannot be tracked debt');
  }
  for (const item of policy.replacedWork) {
    if (!nonempty(item.replacementUrl) || !Array.isArray(item.evidenceUrls) ||
        !item.evidenceUrls.length) throw new Error('Replacement needs a proven successor');
  }
  if (policy.proposedExclusions.some(x => x.verified === true)) {
    throw new Error('Proposed exclusions may not masquerade as verified exclusions');
  }
  const counts = {
    hardUnresolved: rows.filter(x => x.pilotClass === 'hard' && x.status !== 'closed').length,
    hardHistoricallyClosed: rows.filter(x => x.pilotClass === 'hard' && x.status === 'closed').length,
    conditionalPending: rows.filter(x => x.pilotClass === 'conditional' && x.status !== 'closed').length,
    verifiedConditionalExclusions: rows.filter(x => x.pilotClass === 'excluded_conditional').length,
    trackedDebt: rows.filter(x => x.pilotClass === 'tracked_debt').length + policy.trackedDebt.length,
    replacedWork: rows.filter(x => x.pilotClass === 'replaced').length + policy.replacedWork.length,
    unknown: policy.unknowns.length + policy.proposedExclusions.length +
      rows.filter(x => x.pilotClass === 'conditional' && x.status !== 'closed').length,
  };
  return {
    schemaVersion: 1, scope: 'owner_only_beta', sourceCheckoutSha: sourceSha,
    fullV3Matrix: { path: 'docs/v3/final-week-release-blocker-matrix.json',
      coverage: matrix.coverage, baselineMainSha: matrix.baselineMainSha,
      snapshotDate: matrix.snapshotDate, itemCount: matrix.items.length },
    decision: 'NOT_CERTIFIED', counts, requiredPilotFlows: policy.requiredPilotFlows,
    explicitlyForbiddenOperations: policy.forbiddenOperations,
    rows, trackedDebt: policy.trackedDebt, replacedWork: policy.replacedWork,
    unknowns: [].concat(policy.unknowns, policy.proposedExclusions.map(x => Object.assign({}, x, {
      reason: x.reason + ' Exclusion only proposed; disabled/unreachable and non-mutation proof required.'
    }))),
    caveat: 'Source/observed-status risk board only, not a hosted-schema audit, exact-SHA CI certificate or GO decision. Full migration inventory remains separate; never extrapolate historical counts.',
  };
}

const esc = x => String(x == null ? '' : x).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const links = ids => ids.length ?
  ids.map(n => '[#' + n + '](' + GITHUB + '/pull/' + n + ')').join(', ') : 'None';

export function renderOwnerOnlyBetaRiskBoard(b) {
  const lines = [
    '# Owner-only beta: scoped release-risk board (A07)', '',
    '**Source checkout:** [' + b.sourceCheckoutSha + '](' + GITHUB + '/commit/' +
      b.sourceCheckoutSha + '). **Decision: NOT CERTIFIED / NO GO pending evidence.**',
    '**Full-V3 inventory:** [' + b.fullV3Matrix.path + '](' + GITHUB + '/blob/' +
      b.sourceCheckoutSha + '/' + b.fullV3Matrix.path + ') (coverage: ' +
      b.fullV3Matrix.coverage + '; snapshot ' + b.fullV3Matrix.snapshotDate +
      '; ' + b.fullV3Matrix.itemCount + ' grouped rows).', '',
    '> The full migration, S15/S16, capability and physical-ownership inventory remains separate. ' +
      'This canonical matrix has partial coverage and historical row verification SHAs. ' +
      'Counts below are source-row counts, not live production defect counts.', '',
    '**Source-row summary:** ' + b.counts.hardUnresolved + ' unresolved hard; ' +
      b.counts.conditionalPending + ' pending conditional; ' +
      b.counts.verifiedConditionalExclusions + ' proved conditional exclusions; ' +
      b.counts.trackedDebt + ' classified beta debt; ' +
      b.counts.replacedWork + ' replaced groups; ' +
      b.counts.unknown + ' unknown/scope reviews (overlap possible).', '',
    '## Pilot boundaries', '',
    '**Required:** ' + b.requiredPilotFlows.join('; ') + '.', '',
    '**Excluded OPERATIONS, not a feature waiver:** ' +
      b.explicitlyForbiddenOperations.join('; ') + '.', '',
    '## Hard blockers (preserved)', '',
    '| Finding | Status | Owner | Dependencies | PR evidence | Required proof |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const x of b.rows.filter(x => x.pilotClass === 'hard')) {
    lines.push('| ' + esc(x.id) + ' | ' + esc(x.status) + ' | ' + esc(x.owner) +
      ' | ' + esc(x.dependencies.join(', ') || 'None') + ' | ' +
      links(x.relatedPRs) + ' | ' + esc(x.requiredEvidence.join('; ')) + ' |');
  }
  lines.push('', '## Conditional blockers: required until proven excluded', '',
    '| Finding | Disposition | Owner | Scope proof needed | Dependencies |',
    '| --- | --- | --- | --- | --- |');
  for (const x of b.rows.filter(x => x.pilotClass === 'conditional' ||
                                      x.pilotClass === 'excluded_conditional')) {
    lines.push('| ' + esc(x.id) + ' | ' + (x.exclusionVerified ?
      'VERIFIED EXCLUDED' : 'PENDING, NOT WAIVED') + ' | ' + esc(x.owner) +
      ' | ' + esc(x.pilotNeed) + ' | ' +
      esc(x.dependencies.join(', ') || 'None') + ' |');
  }
  lines.push('', '## Tracked debt (not safety)', '');
  if (!b.trackedDebt.length) {
    lines.push('No item is safely evidenced as beta debt in this snapshot. This is NOT zero full-V3 debt.');
  }
  for (const x of b.trackedDebt) {
    lines.push('- **' + x.id + '** (' + x.owner + '): ' + x.reason +
      '; review by ' + x.reviewBy + '; ' + x.evidenceUrls.join(', '));
  }
  lines.push('', '## Replaced work', '');
  for (const x of b.replacedWork) {
    lines.push('- **' + x.id + '** (' + x.owner + '): ' + x.reason +
      ' Successor: ' + x.replacementUrl + '; donors: ' + x.evidenceUrls.join(', '));
  }
  lines.push('', '## Unknowns and proposed exclusions requiring evidence', '');
  for (const x of b.unknowns) lines.push('- **' + x.id + '** (' +
    x.owner + '): ' + x.reason);
  lines.push('', '## Decision rule', '',
    'An owner-only audience cannot replace server authorization. Critical pilot workflows ' +
    'require current RLS, privacy, single-writer authority, idempotency/recovery, Results/voting ' +
    'correctness, local-only automated testing and exact-SHA evidence. Exclusions require ' +
    'written owner approval, proof of disabled/unreachable features, and proof that excluded ' +
    'features cannot mutate canonical pilot state. Hosted migration, production deploy and ' +
    'public-write reopening require separate approvals.', '',
    '**Result: ' + b.decision + '.** ' + b.caveat, '');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const val = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8'
  }).trim();
  if (val('--candidate-sha') && val('--candidate-sha') !== checkout) {
    throw new Error('Candidate SHA does not match checkout');
  }
  const matrix = JSON.parse(readFileSync(resolve(ROOT,
    val('--matrix') || 'docs/v3/final-week-release-blocker-matrix.json'), 'utf8'));
  const policy = JSON.parse(readFileSync(resolve(ROOT,
    val('--policy') || 'docs/v3/owner-only-beta-risk-scope.json'), 'utf8'));
  const report = buildOwnerOnlyBetaRiskBoard(matrix, policy, checkout);
  process.stdout.write(args.includes('--json') ?
    JSON.stringify(report, null, 2) + '\n' : renderOwnerOnlyBetaRiskBoard(report));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); }
  catch (error) { console.error('A07 fail-closed: ' + error.message); process.exitCode = 1; }
}
