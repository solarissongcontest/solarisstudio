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

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}

export function parseStudio2ResultPreconditions(value: unknown): Studio2ResultPreconditions {
  const row = object(value, 'result preconditions');
  return {
    participantCount: numberValue(row.participantCount, 'participantCount'),
    juryEnabled: boolValue(row.juryEnabled, 'juryEnabled'),
    juryRequiredPoints: numberValue(row.juryRequiredPoints, 'juryRequiredPoints'),
    juryVoterCount: numberValue(row.juryVoterCount, 'juryVoterCount'),
    juryVoteRows: numberValue(row.juryVoteRows, 'juryVoteRows'),
    juryDnvCount: numberValue(row.juryDnvCount, 'juryDnvCount'),
    juryIncompleteCount: numberValue(row.juryIncompleteCount, 'juryIncompleteCount'),
    juryConflictCount: numberValue(row.juryConflictCount, 'juryConflictCount'),
    juryReady: boolValue(row.juryReady, 'juryReady'),
    televoteEnabled: boolValue(row.televoteEnabled, 'televoteEnabled'),
    televoteVoteRows: numberValue(row.televoteVoteRows, 'televoteVoteRows'),
    televoteReady: boolValue(row.televoteReady, 'televoteReady'),
    calculationReady: boolValue(row.calculationReady, 'calculationReady'),
    resultRowCount: numberValue(row.resultRowCount, 'resultRowCount'),
    reconcileIssueCount: numberValue(row.reconcileIssueCount, 'reconcileIssueCount'),
    resultReady: boolValue(row.resultReady, 'resultReady'),
    publishedResults: boolValue(row.publishedResults, 'publishedResults'),
  };
}

export function parseStudio2ResultOperationRow(value: unknown): Studio2ResultOperationRow {
  const row = object(value, 'result operations row');
  if (!STUDIO2_RESULT_LIFECYCLE.includes(row.lifecycle as Studio2ResultLifecycle)) {
    throw new Error('Invalid result lifecycle');
  }
  return {
    showId: stringValue(row.showId, 'showId'),
    showName: stringValue(row.showName, 'showName'),
    showKind: stringValue(row.showKind, 'showKind'),
    sortOrder: numberValue(row.sortOrder, 'sortOrder'),
    lifecycle: row.lifecycle as Studio2ResultLifecycle,
    calculationVersion: numberValue(row.calculationVersion, 'calculationVersion'),
    lastCalculatedAt: nullableString(row.lastCalculatedAt),
    lastCalculatedBy: nullableString(row.lastCalculatedBy),
    reviewedVersion: nullableNumber(row.reviewedVersion),
    reviewedAt: nullableString(row.reviewedAt),
    reviewedBy: nullableString(row.reviewedBy),
    lockedVersion: nullableNumber(row.lockedVersion),
    lockedAt: nullableString(row.lockedAt),
    lockedBy: nullableString(row.lockedBy),
    revealReadyVersion: nullableNumber(row.revealReadyVersion),
    revealReadyAt: nullableString(row.revealReadyAt),
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
    calculationVersion: numberValue(row.calculationVersion, 'calculationVersion'),
    previousVersion: numberValue(row.previousVersion, 'previousVersion'),
    materializedRows: numberValue(row.materializedRows ?? 0, 'materializedRows'),
    updatedRows: numberValue(row.updatedRows ?? 0, 'updatedRows'),
    preconditionsBefore: parseStudio2ResultPreconditions(row.preconditionsBefore),
    preconditionsAfter: parseStudio2ResultPreconditions(row.preconditionsAfter),
    idempotentReplay: boolValue(row.idempotentReplay, 'idempotentReplay'),
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2ResultsOperations(editionId: string): Promise<Studio2ResultOperationRow[]> {
  if (!editionId) return [];
  const data = await rpc('studio2_results_operations_snapshot', { p_edition_id: editionId });
  if (!Array.isArray(data)) return [];
  return data.map(parseStudio2ResultOperationRow);
}

export async function executeStudio2ResultOperation(input: {
  showId: string;
  action: Studio2ResultAction;
  reason: string;
  executionId: string;
  expectedVersion: number;
}): Promise<Studio2ResultExecution> {
  const reason = input.reason.trim();
  if (!input.showId) throw new Error('Show is required.');
  if (!STUDIO2_RESULT_ACTIONS.includes(input.action)) throw new Error('Unsupported result operation.');
  if (reason.length < 5) throw new Error('A reason of at least 5 characters is required.');
  if (!input.executionId) throw new Error('Execution id is required.');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error('Expected calculation version is invalid.');
  }

  const data = await rpc('studio2_execute_result_operation', {
    p_show_id: input.showId,
    p_action: input.action,
    p_reason: reason,
    p_execution_id: input.executionId,
    p_expected_version: input.expectedVersion,
  });
  return parseExecution(data);
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

export function availableStudio2ResultActions(row: Studio2ResultOperationRow): Studio2ResultAction[] {
  const actions: Studio2ResultAction[] = [];
  const { preconditions: pre, calculationVersion: version } = row;

  // Publication is authoritative and terminal for this control plane. Once the
  // canonical result layer is public, every lifecycle mutation is unavailable
  // until Publication makes that layer private again.
  if (pre.publishedResults) return actions;

  if (pre.calculationReady && row.lockedVersion !== version) actions.push('calculate');
  if (version > 0 && pre.resultReady && row.reviewedVersion !== version) actions.push('review');
  if (version > 0 && row.reviewedVersion === version && row.lockedVersion !== version) actions.push('lock');
  if (version > 0 && row.lockedVersion === version) actions.push('unlock');
  if (version > 0 && row.lockedVersion === version && row.revealReadyVersion !== version) actions.push('mark_reveal_ready');
  if (version > 0 && row.revealReadyVersion === version) actions.push('clear_reveal_ready');
  return actions;
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
