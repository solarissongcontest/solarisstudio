import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const requireReady = process.argv.includes('--require-ready');
const persistencePath = 'src/lib/studio2-persistence.ts';
const routePath = 'src/routes/_authenticated/admin/control-room.tsx';
const persistence = readFileSync(persistencePath, 'utf8');
const route = readFileSync(routePath, 'utf8');

function blockBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

function sqlFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...sqlFiles(path));
    else if (entry.endsWith('.sql')) result.push(path);
  }
  return result;
}

const requestBlock = blockBetween(
  persistence,
  'export type Studio2TransitionEditionRequest = {',
  '};',
);
const mutationBlock = blockBetween(
  persistence,
  'async transitionEdition(request: Studio2TransitionEditionRequest)',
  'async listTransitionApprovals',
);

const migrations = sqlFiles('supabase/migrations').map((path) => ({
  path,
  source: readFileSync(path, 'utf8'),
}));
const sqlCorpus = migrations.map((migration) => migration.source).join('\n');
const archiveCommandMigrations = migrations.filter(
  ({ source }) =>
    source.includes('studio2_archive_edition_v3') &&
    source.includes('studio2_claim_operation') &&
    source.includes('studio2_complete_operation'),
);
const archiveGuardMigrations = migrations.filter(
  ({ source }) =>
    source.includes('v3_guard_archive_runtime_transition') &&
    source.includes("current_setting('solaris.v3_archive_command', true)"),
);

const requirements = [
  {
    id: 'expected-runtime-version',
    ok:
      requestBlock.includes('expectedVersion') &&
      mutationBlock.includes('p_expected_version') &&
      mutationBlock.includes('request.expectedVersion') &&
      route.includes('const expectedVersion = snapshotQuery.data?.runtime.version') &&
      route.includes('expectedVersion,'),
    evidence: [persistencePath, routePath],
  },
  {
    id: 'stable-operation-identity',
    ok:
      requestBlock.includes('operationId') &&
      mutationBlock.includes('p_operation_id') &&
      mutationBlock.includes('request.operationId') &&
      route.includes('const operationId = crypto.randomUUID()') &&
      route.includes('operationId,'),
    evidence: [persistencePath, routePath],
  },
  {
    id: 'stable-idempotency-key',
    ok:
      requestBlock.includes('idempotencyKey') &&
      mutationBlock.includes('p_idempotency_key') &&
      mutationBlock.includes('request.idempotencyKey') &&
      route.includes('idempotencyKey: `edition-transition:${operationId}`'),
    evidence: [persistencePath, routePath],
  },
  {
    id: 'server-operation-ledger',
    ok: archiveCommandMigrations.length > 0,
    evidence: archiveCommandMigrations.map((migration) => migration.path),
  },
  {
    id: 'transport-reconciliation',
    ok:
      mutationBlock.includes("'studio2_reconcile_operation'") &&
      mutationBlock.includes('p_operation_id: request.operationId ?? operationId') &&
      mutationBlock.includes('mapReconciledArchiveRuntime') &&
      sqlCorpus.includes('studio2_reconcile_operation'),
    evidence: [persistencePath, 'supabase/migrations/**'],
  },
  {
    id: 'legacy-archive-bypass-blocked',
    ok:
      archiveGuardMigrations.length > 0 &&
      mutationBlock.includes("if (request.to !== 'archived')") &&
      mutationBlock.includes("client.rpc('studio2_archive_edition_v3'") &&
      !mutationBlock.includes("p_to: 'archived'"),
    evidence: [persistencePath, ...archiveGuardMigrations.map((migration) => migration.path)],
  },
] as const;

const blockers = requirements.filter((item) => !item.ok).map((item) => item.id);
const ready = blockers.length === 0;
const report = {
  schemaVersion: 4,
  ready,
  transitionConsumer: persistencePath,
  requirements,
  archiveCommandMigrations: archiveCommandMigrations.map((migration) => migration.path),
  archiveGuardMigrations: archiveGuardMigrations.map((migration) => migration.path),
  blockers,
  rationale:
    'S14 Archive is ready only when the viewed runtime version, stable operation/idempotency identity, durable command ledger, bounded transport reconciliation, and legacy-path guard all converge on the canonical studio2_edition_runtime lifecycle truth.',
};

if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  process.stdout.write(`S14 Archive transition contract: ${ready ? 'READY' : 'BLOCKED'}\n`);
  if (blockers.length) process.stdout.write(`Missing: ${blockers.join(', ')}\n`);
}

if (requireReady && !ready) process.exit(1);
