import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityProofFromManifest } from './quality-outcome-proof.mjs';

const sha = 'a'.repeat(40);
const fields = {
  candidate_sha: sha, checkout_sha: sha, run_id: '42220315653', run_attempt: '1',
  production_build: 'success', client_budget: 'failure', route_tree_generated: 'success',
  route_tree_untracked: 'success', typecheck: 'success', unit_tests: 'success',
  lint: 'success', tracked_source_check: 'success',
};
const dump = (parts=fields) => Object.entries(parts).map(([k,v]) => k + '=' + v).join('\n') + '\n';

test('retains failed budget while recording TypeScript, unit and lint independently', () => {
  const p=qualityProofFromManifest(dump(),sha);
  assert.equal(p.candidateSha,sha);
  assert.equal(p.workflowRunId,'42220315653');
  assert.equal(p.allChecksSucceeded,false);
  assert.deepEqual(p.failedChecks,['client_budget']);
  assert.deepEqual(p.unexecutedChecks,[]);
  assert.equal(p.checks.typecheck,'success');
  assert.equal(p.checks.unit_tests,'success');
  assert.equal(p.checks.lint,'success');
  assert.equal(p.certificationClaim,false);
  assert.equal(p.releaseCertified,false);
});

test('green Quality diagnostics do not certify S16', () => {
  const p=qualityProofFromManifest(dump({...fields,client_budget:'success'}),sha);
  assert.equal(p.allChecksSucceeded,true);
  assert.equal(p.releaseCertified,false);
});

test('skips and cancellations never count as success', () => {
  const p=qualityProofFromManifest(dump({...fields,unit_tests:'skipped',lint:'cancelled',typecheck:'not-run'}),sha);
  assert.equal(p.allChecksSucceeded,false);
  assert.deepEqual(p.unexecutedChecks,['typecheck','unit_tests','lint']);
});

test('stale SHA, run identity errors, duplicate and missing fields fail closed', () => {
  for(const manifest of [
    dump({...fields,checkout_sha:'b'.repeat(40)}),
    dump({...fields,candidate_sha:'b'.repeat(40)}),
    dump({...fields,run_id:'unknown'}),
    dump({...fields,unit_tests:'passed'}),
    dump({...fields,lint:''}),
    dump({...fields,extra:'hidden'}),
    dump().replace('client_budget=failure\n',''),
    dump()+'client_budget=success\n',
  ]) assert.throws(()=>qualityProofFromManifest(manifest,sha));
  assert.throws(()=>qualityProofFromManifest(dump(),'short'));
});
