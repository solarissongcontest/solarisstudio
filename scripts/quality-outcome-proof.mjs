/** Pure conversion of exact-head Quality diagnostics into machine-readable evidence.
 * This is a Quality check record, NEVER an S16 release certification artifact.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const CHECKS = [
  'production_build', 'client_budget', 'route_tree_generated',
  'route_tree_untracked', 'typecheck', 'unit_tests', 'lint', 'tracked_source_check',
];
const OUTCOMES = new Set(['success','failure','cancelled','skipped','not-run']);

export function qualityProofFromManifest(manifest, expectedSha) {
  if (typeof expectedSha !== 'string' || !SHA.test(expectedSha)) throw new Error('Expected exact lowercase candidate SHA');
  if (typeof manifest !== 'string') throw new Error('Quality diagnostic manifest must be UTF-8 text');
  const lines = new Map();
  for (const line of manifest.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf('=');
    if (index < 1) throw new Error('Malformed Quality diagnostic line');
    const key = line.slice(0,index).trim(), value = line.slice(index+1).trim();
    if (lines.has(key) || !key || !value) throw new Error(`Duplicate or empty Quality diagnostic field: ${key}`);
    lines.set(key, value);
  }
  const required = ['candidate_sha','checkout_sha','run_id','run_attempt',...CHECKS];
  for (const name of required) if (!lines.has(name)) throw new Error(`Missing Quality diagnostic field: ${name}`);
  for (const name of lines.keys()) if (!required.includes(name)) throw new Error(`Unexpected Quality diagnostic field: ${name}`);
  const candidateSha = lines.get('candidate_sha'), checkoutSha = lines.get('checkout_sha');
  if (!SHA.test(candidateSha) || candidateSha !== expectedSha || checkoutSha !== expectedSha) {
    throw new Error(`Quality diagnostic candidate/checkout SHA does not match ${expectedSha}`);
  }
  const runId = lines.get('run_id'), attempt = lines.get('run_attempt');
  if (!/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt)) throw new Error('Quality run identity requires positive integers');
  const checks = {};
  for (const name of CHECKS) {
    const outcome = lines.get(name);
    if (!OUTCOMES.has(outcome)) throw new Error(`Invalid Quality outcome ${name}: ${outcome}`);
    checks[name] = outcome;
  }
  const allChecksSucceeded = CHECKS.every(name=>checks[name]==='success');
  return {
    schemaVersion: 1,
    gateId: 'quality-independent-diagnostics',
    candidateSha, checkoutSha, workflowRunId: runId, runAttempt: Number(attempt),
    checks, allChecksSucceeded,
    failedChecks: CHECKS.filter(name=>checks[name]==='failure'),
    unexecutedChecks: CHECKS.filter(name=>checks[name]==='skipped' || checks[name]==='not-run' || checks[name]==='cancelled'),
    source: 'quality-diagnostics.txt',
    certificationClaim: false,
    releaseCertified: false,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.length !== 6 || argv[0] !== '--input' || argv[2] !== '--expected' || argv[4] !== '--output') {
    throw new Error('Usage: node scripts/quality-outcome-proof.mjs --input <txt> --expected <sha> --output <json>');
  }
  const report = qualityProofFromManifest(readFileSync(resolve(argv[1]),'utf8'),argv[3]);
  writeFileSync(resolve(argv[5]),JSON.stringify(report,null,2)+'\n');
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(); } catch (error) { process.stderr.write(`Quality proof invalid: ${error.message}\n`); process.exitCode=1; }
}
