import { supabase } from '@/integrations/supabase/client';

export const STUDIO2_RESULT_LIFECYCLE = [
  'votes_collected',
  'validation',
  'calculation_ready',
  'calculated',
  'reviewed',
  'locked',
  'reveal_ready',
  'published',
] as const;

export type Studio2ResultLifecycle = (typeof STUDIO2_RESULT_LIFECYCLE)[number];

export const STUDIO2_RESULT_ACTIONS = [
  'calculate',
  'review',
  'lock',
  'unlock',
  'mark_reveal_ready',
  'clear_reveal_ready',
] as const;

export type Studio2ResultAction = (typeof STUDIO2_RESULT_ACTIONS)[number];

export type Studio2ResultPreconditions = {
  participantCount: number;
  juryEnabled: boolean;
  juryRequiredPoints: number;
  juryVoterCount: number;
  juryVoteRows: number;
  juryDnvCount: number;
  juryIncompleteCount: number;
  juryConflictCount: number;
  juryReady: boolean;
  televoteEnabled: boolean;
  televoteVoteRows: number;
  televoteReady: boolean;
  calculationReady: boolean;
  resultRowCount: number;
  entityCountMismatch: number;
  sourceReconcileIssueCount: number;
  reconcileIssueCount: number;
  resultReady: boolean;
  publishedResults: boolean;
};

export type Studio2ResultOperationRow = {
  showId: string;
  showName: string;
  showKind: string;
  sortOrder: number;
  lifecycle: Studio2ResultLifecycle;
  calculationVersion: number;
  lastCalculatedAt: string | null;
  lastCalculatedBy: string | null;
  reviewedVersion: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  lockedVersion: number | null;
  lockedAt: string | null;
  lockedBy: string | null;
  revealReadyVersion: number | null;
  revealReadyAt: string | null;
  revealReadyBy: string | null;
  preconditions: Studio2ResultPreconditions;
};

export type Studio2ResultExecution = {
  executionId: string;
  showId: string;
  editionId: string;
  action: Studio2ResultAction;
  reason: string;
  calculationVersion: number;
  previousVersion: number;
  materializedRows: number;
  updatedRows: number;
  preconditionsBefore: Studio2ResultPreconditions;
  preconditionsAfter: Studio2ResultPreconditions;
  idempotentReplay: boolean;
};

export type Studio2ResultBlocker = {
  id: 'jury' | 'televote' | 'calculation' | 'reconciliation';
  label: string;
  detail: string;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`);
  return value.trim();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nonNegativeIntegerValue(value: unknown, label: string): number {
  const parsed = integerValue(value, label);
  if (parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNonNegativeInteger(value: unknown, label: string): number | null {
  if (value == null) return null;
  return nonNegativeIntegerValue(value, label);
}

function nullableTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  const timestamp = stringValue(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`Invalid ${label}`);
  return timestamp;
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}

export function parseStudio2ResultPreconditions(value: unknown): Studio2ResultPreconditions {
  const row = object(value, 'result preconditions');
  const participantCount = nonNegativeIntegerValue(row.participantCount, 'participantCount');
  const resultRowCount = nonNegativeIntegerValue(row.resultRowCount, 'resultRowCount');
  const sourceReconcileIssueCount = nonNegativeIntegerValue(row.reconcileIssueCount, 'reconcileIssueCount');
  const entityCountMismatch = Math.abs(resultRowCount - participantCount);
  const reconciliationIssues = sourceReconcileIssueCount + entityCountMismatch;
  const sourceResultReady = boolValue(row.resultReady, 'resultReady');
  return {
    participantCount,
    juryEnabled: boolValue(row.juryEnabled, 'juryEnabled'),
    juryRequiredPoints: nonNegativeIntegerValue(row.juryRequiredPoints, 'juryRequiredPoints'),
    juryVoterCount: nonNegativeIntegerValue(row.juryVoterCount, 'juryVoterCount'),
    juryVoteRows: nonNegativeIntegerValue(row.juryVoteRows, 'juryVoteRows'),
    juryDnvCount: nonNegativeIntegerValue(row.juryDnvCount, 'juryDnvCount'),
    juryIncompleteCount: nonNegativeIntegerValue(row.juryIncompleteCount, 'juryIncompleteCount'),
    juryConflictCount: nonNegativeIntegerValue(row.juryConflictCount, 'juryConflictCount'),
    juryReady: boolValue(row.juryReady, 'juryReady'),
    televoteEnabled: boolValue(row.televoteEnabled, 'televoteEnabled'),
    televoteVoteRows: nonNegativeIntegerValue(row.televoteVoteRows, 'televoteVoteRows'),
    televoteReady: boolValue(row.televoteReady, 'televoteReady'),
    calculationReady: boolValue(row.calculationReady, 'calculationReady'),
    resultRowCount,
    entityCountMismatch,
    sourceReconcileIssueCount,
    reconcileIssueCount: reconciliationIssues,
    resultReady: sourceResultReady && reconciliationIssues === 0,
    publishedResults: boolValue(row.publishedResults, 'publishedResults'),
  };
}

export function parseStudio2ResultOperationRow(value: unknown): Studio2ResultOperationRow {
  const row = object(value, 'result operations row');
  if (!STUDIO2_RESULT_LIFECYCLE.includes(row.lifecycle as Studio2ResultLifecycle)) {
    throw new Error('Invalid result lifecycle');
  }
  const calculationVersion = nonNegativeIntegerValue(row.calculationVersion, 'calculationVersion');
  // Legacy result rows can exist without a governed calculation receipt. They
  // are reconciliation evidence, not proof that Results operations calculated
  // a version. Never contradict Publication's "No calculated results" state.
  const lifecycle = row.lifecycle === 'calculated' && calculationVersion === 0
    ? 'validation'
    : row.lifecycle as Studio2ResultLifecycle;
  return {
    showId: stringValue(row.showId, 'showId'),
    showName: stringValue(row.showName, 'showName'),
    showKind: stringValue(row.showKind, 'showKind'),
    sortOrder: integerValue(row.sortOrder, 'sortOrder'),
    lifecycle,
    calculationVersion,
    lastCalculatedAt: nullableTimestamp(row.lastCalculatedAt, 'lastCalculatedAt'),
    lastCalculatedBy: nullableString(row.lastCalculatedBy),
    reviewedVersion: nullableNonNegativeInteger(row.reviewedVersion, 'reviewedVersion'),
    reviewedAt: nullableTimestamp(row.reviewedAt, 'reviewedAt'),
    reviewedBy: nullableString(row.reviewedBy),
    lockedVersion: nullableNonNegativeInteger(row.lockedVersion, 'lockedVersion'),
    lockedAt: nullableTimestamp(row.lockedAt, 'lockedAt'),
    lockedBy: nullableString(row.lockedBy),
    revealReadyVersion: nullableNonNegativeInteger(row.revealReadyVersion, 'revealReadyVersion'),
    revealReadyAt: nullableTimestamp(row.revealReadyAt, 'revealReadyAt'),
    revealReadyBy: nullableString(row.revealReadyBy),
    preconditions: parseStudio2ResultPreconditions(row.preconditions),
  };
}

function parseExecution(value: unknown): Studio2ResultExecution {
  const row = object(value, 'result operation execution');
  if (!STUDIO2_RESULT_ACTIONS.includes(row.action as Studio2ResultAction)) {
    throw new Error('Invalid result operation action');
  }
  return {
    executionId: stringValue(row.executionId, 'executionId'),
    showId: stringValue(row.showId, 'showId'),
    editionId: stringValue(row.editionId, 'editionId'),
    action: row.action as Studio2ResultAction,
    reason: stringValue(row.reason, 'reason'),
    calculationVersion: nonNegativeIntegerValue(row.calculationVersion, 'calculationVersion'),
    previousVersion: nonNegativeIntegerValue(row.previousVersion, 'previousVersion'),
    materializedRows: nonNegativeIntegerValue(row.materializedRows ?? 0, 'materializedRows'),
    updatedRows: nonNegativeIntegerValue(row.updatedRows ?? 0, 'updatedRows'),
    preconditionsBefore: parseStudio2ResultPreconditions(row.preconditionsBefore),
    preconditionsAfter: parseStudio2ResultPreconditions(row.preconditionsAfter),
    idempotentReplay: boolValue(row.idempotentReplay, 'idempotentReplay'),
  };
}

export function validateStudio2ResultExecution(
  execution: Studio2ResultExecution,
  request: Pick<Studio2ResultExecution, 'executionId' | 'showId' | 'action'> & {
    expectedVersion?: number;
  },
): Studio2ResultExecution {
  const mismatches: string[] = [];
  if (execution.executionId !== request.executionId) mismatches.push('executionId');
  if (execution.showId !== request.showId) mismatches.push('showId');
  if (execution.action !== request.action) mismatches.push('action');
  if (request.expectedVersion !== undefined && execution.previousVersion !== request.expectedVersion) {
    mismatches.push('previousVersion');
  }
  if (execution.calculationVersion < execution.previousVersion) mismatches.push('calculationVersion');
  if (mismatches.length) {
    throw new Error(`Result operation receipt does not match the requested command (${mismatches.join(', ')}).`);
  }
  return execution;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2ResultsOperations(editionId: string): Promise<Studio2ResultOperationRow[]> {
  const normalizedEditionId = editionId.trim();
  if (!normalizedEditionId) throw new Error('Results operations requires an explicit edition scope.');
  const data = await rpc('studio2_results_operations_snapshot', { p_edition_id: normalizedEditionId });
  if (!Array.isArray(data)) throw new Error('Invalid results operations snapshot: expected an array.');
  const rows = data.map(parseStudio2ResultOperationRow);
  const showIds = rows.map((row) => row.showId);
  if (new Set(showIds).size !== showIds.length) {
    throw new Error('Results operations snapshot returned duplicate show rows.');
  }
  return rows;
}

export async function executeStudio2ResultOperation(input: {
  showId: string;
  action: Studio2ResultAction;
  reason: string;
  executionId: string;
  expectedVersion: number;
}): Promise<Studio2ResultExecution> {
  const reason = input.reason.trim();
  if (!input.showId.trim()) throw new Error('Show is required.');
  if (!STUDIO2_RESULT_ACTIONS.includes(input.action)) throw new Error('Unsupported result operation.');
  if (reason.length < 5) throw new Error('A reason of at least 5 characters is required.');
  if (!input.executionId.trim()) throw new Error('Execution id is required.');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error('Expected calculation version is invalid.');
  }

  const data = await rpc('studio2_execute_result_operation', {
    p_show_id: input.showId.trim(),
    p_action: input.action,
    p_reason: reason,
    p_execution_id: input.executionId.trim(),
    p_expected_version: input.expectedVersion,
  });
  const execution = parseExecution(data);
  return validateStudio2ResultExecution(execution, {
    executionId: input.executionId.trim(),
    showId: input.showId.trim(),
    action: input.action,
    expectedVersion: input.expectedVersion,
  });
}

export function resultLifecycleLabel(state: Studio2ResultLifecycle): string {
  switch (state) {
    case 'votes_collected': return 'Votes collecting';
    case 'validation': return 'Validation';
    case 'calculation_ready': return 'Calculation ready';
    case 'calculated': return 'Calculated';
    case 'reviewed': return 'Reviewed';
    case 'locked': return 'Locked';
    case 'reveal_ready': return 'Reveal ready';
    case 'published': return 'Published';
  }
}

export function resultLifecycleTone(state: Studio2ResultLifecycle): 'neutral' | 'info' | 'attention' | 'ready' | 'blocked' {
  switch (state) {
    case 'votes_collected': return 'neutral';
    case 'validation': return 'attention';
    case 'calculation_ready': return 'info';
    case 'calculated': return 'info';
    case 'reviewed': return 'ready';
    case 'locked': return 'ready';
    case 'reveal_ready': return 'ready';
    case 'published': return 'ready';
  }
}

export function resultActionLabel(action: Studio2ResultAction, version: number): string {
  switch (action) {
    case 'calculate': return version > 0 ? 'Recalculate results' : 'Calculate results';
    case 'review': return 'Mark reviewed';
    case 'lock': return 'Lock result version';
    case 'unlock': return 'Unlock result version';
    case 'mark_reveal_ready': return 'Mark reveal ready';
    case 'clear_reveal_ready': return 'Clear reveal readiness';
  }
}

/**
 * Human-facing blocker explanations derived only from the authoritative
 * Results snapshot. These reasons never decide whether an operation is valid;
 * the server remains the final preflight authority for every command.
 */
export function studio2ResultBlockers(row: Studio2ResultOperationRow): Studio2ResultBlocker[] {
  const pre = row.preconditions;
  if (pre.publishedResults) return [];

  if (!pre.calculationReady) {
    const blockers: Studio2ResultBlocker[] = [];
    if (pre.juryEnabled && !pre.juryReady) {
      blockers.push({
        id: 'jury',
        label: 'Jury input is not finalized',
        detail: `${pre.juryIncompleteCount} incomplete · ${pre.juryConflictCount} conflicts · ${pre.juryDnvCount} did not vote`,
      });
    }
    if (pre.televoteEnabled && !pre.televoteReady) {
      blockers.push({
        id: 'televote',
        label: 'Public vote input is not finalized',
        detail: `${pre.televoteVoteRows} canonical public-vote rows are currently available`,
      });
    }
    if (!blockers.length) {
      blockers.push({
        id: 'calculation',
        label: 'Calculation preflight is not ready',
        detail: 'The canonical Results snapshot still reports an unmet calculation precondition.',
      });
    }
    return blockers;
  }

  if (row.calculationVersion > 0 && (!pre.resultReady || pre.reconcileIssueCount > 0)) {
    return [{
      id: 'reconciliation',
      label: 'Calculated result needs reconciliation',
      detail: [
        pre.entityCountMismatch
          ? `${pre.entityCountMismatch} participant/result-row count mismatch${pre.entityCountMismatch === 1 ? '' : 'es'}`
          : null,
        pre.sourceReconcileIssueCount
          ? `${pre.sourceReconcileIssueCount} total or weighting issue${pre.sourceReconcileIssueCount === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean).join(' · ') || 'The canonical result snapshot is not yet ready for review.',
    }];
  }

  return [];
}

export function availableStudio2ResultActions(row: Studio2ResultOperationRow): Studio2ResultAction[] {
  const actions: Studio2ResultAction[] = [];
  const { preconditions: pre, calculationVersion: version } = row;

  // Publication is authoritative and terminal for this control plane. Once the
  // canonical result layer is public, every lifecycle mutation is unavailable
  // until Publication makes that layer private again.
  if (pre.publishedResults) return actions;

  const revealReady = version > 0 && row.revealReadyVersion === version;
  const locked = version > 0 && row.lockedVersion === version;

  if (pre.calculationReady && !locked) actions.push('calculate');
  if (version > 0 && pre.resultReady && row.reviewedVersion !== version) actions.push('review');
  if (version > 0 && row.reviewedVersion === version && !locked) actions.push('lock');

  // Rollback must unwind the strict lifecycle one stage at a time. A version
  // that is still marked reveal-ready cannot also be unlocked from the client;
  // clear reveal readiness first, then unlock the frozen result version.
  if (locked && !revealReady) actions.push('unlock');
  if (locked && !revealReady) actions.push('mark_reveal_ready');
  if (revealReady) actions.push('clear_reveal_ready');
  return actions;
}

export function isStudio2ResultReleaseReady(row: Studio2ResultOperationRow | null | undefined) {
  if (!row) return false;
  const version = row.calculationVersion;
  return (
    version > 0 &&
    row.preconditions.resultReady &&
    row.reviewedVersion === version &&
    row.lockedVersion === version &&
    row.revealReadyVersion === version
  );
}

export function summarizeStudio2ResultsOperations(rows: readonly Studio2ResultOperationRow[]) {
  return {
    shows: rows.length,
    calculationReady: rows.filter((row) => row.preconditions.calculationReady).length,
    blocking: rows.filter((row) => !row.preconditions.calculationReady || row.preconditions.reconcileIssueCount > 0).length,
    locked: rows.filter((row) => row.calculationVersion > 0 && row.lockedVersion === row.calculationVersion).length,
    revealReady: rows.filter((row) => row.calculationVersion > 0 && row.revealReadyVersion === row.calculationVersion).length,
    published: rows.filter((row) => row.preconditions.publishedResults).length,
  };
}
