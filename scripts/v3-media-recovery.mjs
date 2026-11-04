#!/usr/bin/env node
/**
 * Manual Solaris V3 Storage recovery. Not a CI workflow, database writer or publishing path.
 * Full manifests are private local evidence and must never enter PR logs.
 */
import { readFile, writeFile, mkdir, appendFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  SOURCE_PROJECT, DESTINATION_PROJECT, REFERENCE_TABLES, assertApprovedWrite, assertAssetClearance,
  inventoryPair, recoveryDigest, transferVerifiedMissing, proposeReferenceReconciliation,
  buildSourceReferenceIndex,
  validateProjectPair,
} from './lib/v3-media-recovery-core.mjs';

const execute = process.argv.includes('--execute');
const approvalArg = process.argv.indexOf('--approval-file');
const approvalPath = approvalArg >= 0 ? process.argv[approvalArg + 1] : null;
const stateArg = process.argv.indexOf('--state-dir');
const stateDir = resolve(stateArg >= 0 ? process.argv[stateArg + 1] :
  join(homedir(), '.local/state/solaris-v3-media-recovery'));
const sourceProject = process.env.SOLARIS_OLD_PROJECT_ID || SOURCE_PROJECT;
const targetProject = process.env.SOLARIS_V3_PROJECT_ID || DESTINATION_PROJECT;
async function privateJson(file, value) {
  await writeFile(join(stateDir, file), JSON.stringify(value, null, 2) + '\n',
    { flag: 'w', mode: 0o600 });
  await chmod(join(stateDir, file), 0o600);
}
async function readReferences(client) {
  const rows = {};
  for (const [table, cfg] of Object.entries(REFERENCE_TABLES)) {
    const all = [];
    const columns = [...new Set([...cfg.key, ...cfg.fields, ...(cfg.evidenceFields || [])])].join(',');
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await client.from(table).select(columns).range(offset, offset + 199);
      if (error || !Array.isArray(data)) throw new Error('Could not safely inspect reference table ' + table);
      all.push(...data);
      if (all.length > 2000) throw new Error('Reference inventory row cap exceeded');
      if (data.length < 200) break;
    }
    rows[table] = all;
  }
  return rows;
}
async function main() {
  validateProjectPair(sourceProject, targetProject);
  if (process.env.CI) throw new Error('Production recovery is forbidden in CI');
  if (process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED !== 'YES_READ_BOTH_PROJECTS') {
    throw new Error('Production inspection requires manual inventory acknowledgment');
  }
  if (execute && !approvalPath) throw new Error('--execute requires --approval-file');
  if (!stateDir.startsWith(homedir() + '/')) throw new Error('State directory must be private under operator home');
  await mkdir(stateDir, { mode: 0o700, recursive: true });
  await chmod(stateDir, 0o700);

  const oldKey = process.env.SOLARIS_OLD_SUPABASE_SERVICE_ROLE_KEY;
  const newKey = process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
  if (!oldKey || !newKey || oldKey === newKey) {
    throw new Error('Both distinct project-specific privileged credentials are required');
  }
  // No hosted client exists in normal CI/test module imports.
  const { createClient } = await import('@supabase/supabase-js');
  const client = (id, key) => createClient('https://' + id + '.supabase.co', key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'solaris-v3-manual-storage-recovery/1' } },
  });
  const source = client(sourceProject, oldKey);
  const destination = client(targetProject, newKey);
  const inventory = await inventoryPair({
    source, destination, sourceId: sourceProject, destinationId: targetProject,
  });
  let referenceStatus = 'complete';
  let oldRows = {}, currentRows = {};
  try {
    oldRows = await readReferences(source);
    currentRows = await readReferences(destination);
  } catch {
    referenceStatus = 'incomplete';
  }
  if (referenceStatus === 'complete') {
    inventory.entries = buildSourceReferenceIndex({ entries: inventory.entries, oldRows, currentRows });
  }
  inventory.generated_at = new Date().toISOString();
  inventory.manifest_sha256 = recoveryDigest(inventory.entries);
  inventory.reference_inspection = referenceStatus;
  await privateJson('recovery-manifest.json', inventory);
  await privateJson('references-source.json', oldRows);
  await privateJson('references-destination.json', currentRows);

  const statusCounts = Object.fromEntries([...new Set(inventory.entries.map(e => e.status))]
    .sort().map(s => [s, inventory.entries.filter(e => e.status === s).length]));
  const byBucket = Object.fromEntries(inventory.source_buckets.map(b => [b.id, {
    public: b.public,
    source_objects: inventory.entries.filter(e => e.bucket === b.id && e.source_id).length,
    missing: inventory.entries.filter(e => e.bucket === b.id && e.status === 'missing_destination').length,
    identical: inventory.entries.filter(e => e.bucket === b.id && e.status === 'identical').length,
    collision: inventory.entries.filter(e => e.bucket === b.id && e.status === 'collision').length,
  }]));
  const results = [];
  if (execute) {
    if (referenceStatus !== 'complete') throw new Error('Reference inspection incomplete; refusing writes');
    if (inventory.entries.some(e => ['collision','unavailable_source','unavailable_destination','missing_bucket'].includes(e.status))) {
      throw new Error('Unresolved collision, missing bucket or unavailable object; refusing writes');
    }
    const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
    assertApprovedWrite({
      approval, key: process.env.SOLARIS_RECOVERY_APPROVAL_HMAC_KEY,
      digest: inventory.manifest_sha256,
    });
    const approved = new Set(approval.reviewed_assets);
    // No direct public-bucket restore of legacy media without asset-by-asset reviewed provenance.
    for (const entry of inventory.entries.filter(e => e.status === 'missing_destination')) {
      if (!approved.has(entry.bucket + '/' + entry.path + '#' + entry.source_sha256)) {
        throw new Error('Signed authorization lacks a reviewed source asset');
      }
      assertAssetClearance(entry, approval);
    }
    for (const entry of inventory.entries.filter(e => e.status === 'missing_destination')) {
      const result = await transferVerifiedMissing({
        source, destination, entry,
        onVerified: record => appendFile(join(stateDir, 'verified-checkpoints.jsonl'),
          JSON.stringify(record) + '\n', { mode: 0o600 }),
      });
      results.push({ bucket: entry.bucket, path: entry.path, ...result });
      if (!['transferred','verified_after_ambiguous_upload','identical'].includes(result.status)) break;
    }
  }
  await privateJson('transfer-results.json', results);
  const verifiedEntries = inventory.entries.map(e => {
    const outcome = results.find(r => r.bucket === e.bucket && r.path === e.path);
    return outcome ? { ...e, status: outcome.status } : e;
  });
  const referenceProposals = referenceStatus === 'complete'
    ? proposeReferenceReconciliation({ oldRows, currentRows, verifiedEntries }) : [];
  await privateJson('reference-proposals.json', referenceProposals);
  const summary = {
    source_project: sourceProject, destination_project: targetProject,
    manifest_sha256: inventory.manifest_sha256, mode: execute ? 'manual-execute' : 'dry-run',
    source_buckets: byBucket, statuses: statusCounts, reference_inspection: referenceStatus,
    source_reference_counts: {
      referenced_or_candidate: inventory.entries.filter(e => e.reference_classification === 'referenced_or_candidate').length,
      unmatched_not_proven_orphan: inventory.entries.filter(e => e.reference_classification === 'unmatched_in_surveyed_media_fields_not_proven_orphan').length,
      sensitive_private_asset: inventory.entries.filter(e => e.reference_classification === 'sensitive_private_asset').length,
    },
    reference_proposal_counts: Object.fromEntries([...new Set(referenceProposals.map(r => r.status))]
      .map(status => [status, referenceProposals.filter(r => r.status === status).length])),
    transfers: {
      verified: results.filter(r => ['transferred','verified_after_ambiguous_upload','identical'].includes(r.status)).length,
      incomplete: results.filter(r => !['transferred','verified_after_ambiguous_upload','identical'].includes(r.status)).length,
    },
    source_deleted: 0, database_written: 0, r2_published: 0,
  };
  await privateJson('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
  if (results.some(r => !['transferred','verified_after_ambiguous_upload','identical'].includes(r.status))) {
    process.exitCode = 2;
  }
}
main().catch(error => {
  // Do not print provider exception text, URLs, paths, tokens or secret material.
  const safe = String(error?.message || 'Unexpected error');
  const allowlisted = [
    'Source and destination must be different projects',
    'Recovery project direction or identity is not authorized',
    'Production recovery is forbidden in CI',
    'Production inspection requires manual inventory acknowledgment',
    '--execute requires --approval-file',
    'State directory must be private under operator home',
    'Both distinct project-specific privileged credentials are required',
    'Reference inspection incomplete; refusing writes',
    'Unresolved collision, missing bucket or unavailable object; refusing writes',
    'Signed authorization lacks a reviewed source asset',
    'Bucket not approved for this recovery operation',
    'Missing or duplicate per-asset clearance',
    'Private asset clearance must retain private visibility',
    'Public restore requires existing canonical publication and media validation evidence',
    'Legacy public asset must pass Solaris image MIME policy',
    'Legacy public asset exceeds Solaris media validation ceiling',
    'Missing explicit production write acknowledgment',
    'Missing protected approval signing key',
    'Invalid, expired or mismatched recovery authorization',
    'Recovery approval signature invalid',
  ];
  console.error(allowlisted.includes(safe) ? safe : 'Recovery failed; see protected local evidence or operator logs');
  process.exitCode = 1;
});
