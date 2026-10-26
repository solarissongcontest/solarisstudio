import { supabase } from '@/integrations/supabase/client';
import type { RevealStrategy } from './results-reveal-model';

export const REVEAL_STATES = ['planning', 'rehearsal', 'armed', 'live', 'complete'] as const;
export type RevealLifecycleState = (typeof REVEAL_STATES)[number];

export type RevealDirectorRow = {
  showId: string;
  showName: string;
  showKind: string;
  sortOrder: number;
  state: RevealLifecycleState;
  version: number;
  strategy: RevealStrategy;
  sequence: string[];
  lockedResultVersion: number | null;
  currentStep: number;
  totalSteps: number;
  calculationVersion: number;
  revealReadyVersion: number | null;
  canManagePlan: boolean;
  canControl: boolean;
  updatedAt: string;
};

export type RevealOperationResult = {
  operationId: string;
  editionId: string;
  showId: string;
  state: RevealLifecycleState;
  strategy: RevealStrategy;
  sequence: string[];
  lockedResultVersion: number | null;
  currentStep: number;
  totalSteps: number;
  previousVersion: number;
  version: number;
  revealedId: string | null;
  replayed: boolean;
  updatedAt: string;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}.`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}.`);
  return parsed;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}.`);
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function revealState(value: unknown): RevealLifecycleState {
  if (!REVEAL_STATES.includes(value as RevealLifecycleState)) {
    throw new Error('Invalid Reveal Director lifecycle state.');
  }
  return value as RevealLifecycleState;
}

function revealStrategy(value: unknown): RevealStrategy {
  if (!['jury_order', 'final_rank_reverse', 'televote_ascending'].includes(String(value))) {
    throw new Error('Invalid Reveal Director strategy.');
  }
  return value as RevealStrategy;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`Invalid ${label}.`);
  }
  return [...value];
}

export function parseRevealDirectorRow(value: unknown): RevealDirectorRow {
  const row = asObject(value, 'Reveal Director row');
  return {
    showId: asString(row.showId, 'show id'),
    showName: asString(row.showName, 'show name'),
    showKind: asString(row.showKind, 'show kind'),
    sortOrder: asNumber(row.sortOrder, 'show sort order'),
    state: revealState(row.state),
    version: asNumber(row.version, 'reveal version'),
    strategy: revealStrategy(row.strategy),
    sequence: stringArray(row.sequence, 'reveal sequence'),
    lockedResultVersion: nullableNumber(row.lockedResultVersion),
    currentStep: asNumber(row.currentStep, 'reveal current step'),
    totalSteps: asNumber(row.totalSteps, 'reveal total steps'),
    calculationVersion: asNumber(row.calculationVersion, 'result calculation version'),
    revealReadyVersion: nullableNumber(row.revealReadyVersion),
    canManagePlan: asBoolean(row.canManagePlan, 'plan capability'),
    canControl: asBoolean(row.canControl, 'control capability'),
    updatedAt: asString(row.updatedAt, 'reveal update time'),
  };
}

export function parseRevealOperationResult(value: unknown): RevealOperationResult {
  const row = asObject(value, 'Reveal Director operation result');
  return {
    operationId: asString(row.operationId, 'operation id'),
    editionId: asString(row.editionId, 'edition id'),
    showId: asString(row.showId, 'show id'),
    state: revealState(row.state),
    strategy: revealStrategy(row.strategy),
    sequence: stringArray(row.sequence, 'reveal sequence'),
    lockedResultVersion: nullableNumber(row.lockedResultVersion),
    currentStep: asNumber(row.currentStep, 'reveal current step'),
    totalSteps: asNumber(row.totalSteps, 'reveal total steps'),
    previousVersion: asNumber(row.previousVersion, 'previous reveal version'),
    version: asNumber(row.version, 'reveal version'),
    revealedId: nullableString(row.revealedId),
    replayed: row.replayed === true,
    updatedAt: asString(row.updatedAt, 'reveal update time'),
  };
}

export function availableRevealTransitions(state: RevealLifecycleState): RevealLifecycleState[] {
  switch (state) {
    case 'planning': return ['rehearsal', 'armed'];
    case 'rehearsal': return ['planning', 'armed'];
    case 'armed': return ['rehearsal', 'live'];
    case 'live': return ['complete'];
    case 'complete': return [];
  }
}

export function revealStateLabel(state: RevealLifecycleState) {
  switch (state) {
    case 'planning': return 'Planning';
    case 'rehearsal': return 'Rehearsal';
    case 'armed': return 'Armed';
    case 'live': return 'Live';
    case 'complete': return 'Complete';
  }
}

export function isRevealArmable(row: Pick<RevealDirectorRow, 'calculationVersion' | 'revealReadyVersion' | 'sequence'>) {
  return row.calculationVersion > 0
    && row.revealReadyVersion === row.calculationVersion
    && row.sequence.length > 0;
}

export async function loadRevealDirectorSnapshot(
  editionId: string,
  client: RpcClient = rpcClient,
): Promise<RevealDirectorRow[]> {
  if (!editionId) return [];
  const { data, error } = await client.rpc('studio2_reveal_director_snapshot', {
    p_edition_id: editionId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data.map(parseRevealDirectorRow) : [];
}

type ReconciledRequest = {
  operationId: string;
  showId: string;
  expectedVersion: number;
  expectedState?: RevealLifecycleState;
};

function validateExactResult(value: unknown, request: ReconciledRequest) {
  const result = parseRevealOperationResult(value);
  if (result.operationId !== request.operationId || result.showId !== request.showId) {
    throw new Error('Reveal receipt belongs to a different operation or show.');
  }
  if (result.previousVersion !== request.expectedVersion || result.version !== request.expectedVersion + 1) {
    throw new Error('Reveal receipt disagrees with the reviewed lifecycle version.');
  }
  if (request.expectedState && result.state !== request.expectedState) {
    throw new Error('Reveal receipt disagrees with the requested lifecycle state.');
  }
  return result;
}

async function reconcileOperation(
  request: ReconciledRequest,
  client: RpcClient,
): Promise<RevealOperationResult | null> {
  const { data, error } = await client.rpc('studio2_reconcile_operation', {
    p_operation_id: request.operationId,
  });
  if (error) return null;
  const receipt = asObject(data, 'reveal operation reconciliation');
  if (receipt.status !== 'succeeded' || receipt.result == null) return null;
  return validateExactResult(receipt.result, request);
}

async function executeWithReconciliation(input: {
  rpcName: string;
  args: Record<string, unknown>;
  request: ReconciledRequest;
  client?: RpcClient;
}) {
  const client = input.client ?? rpcClient;
  const { data, error } = await client.rpc(input.rpcName, input.args);
  if (!error) return validateExactResult(data, input.request);

  try {
    const reconciled = await reconcileOperation(input.request, client);
    if (reconciled) return reconciled;
  } catch {
    // A malformed or contradictory receipt must never replace the original
    // command failure. The caller reloads canonical state before deciding what
    // to do next.
  }
  throw error;
}

function operationIdentity(prefix: string) {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `${prefix}:${operationId}`,
  };
}

export async function configureRevealPlan(input: {
  showId: string;
  strategy: RevealStrategy;
  sequence: string[];
  expectedVersion: number;
}, client?: RpcClient) {
  if (!input.showId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error('Reload Reveal Director before saving the plan.');
  }
  const ids = operationIdentity('reveal-configure');
  return executeWithReconciliation({
    rpcName: 'studio2_configure_reveal_v3',
    args: {
      p_show_id: input.showId,
      p_strategy: input.strategy,
      p_sequence: input.sequence,
      p_expected_version: input.expectedVersion,
      p_operation_id: ids.operationId,
      p_idempotency_key: ids.idempotencyKey,
    },
    request: {
      operationId: ids.operationId,
      showId: input.showId,
      expectedVersion: input.expectedVersion,
    },
    client,
  });
}

export async function transitionReveal(input: {
  showId: string;
  to: RevealLifecycleState;
  expectedVersion: number;
  reason?: string | null;
}, client?: RpcClient) {
  if (!input.showId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error('Reload Reveal Director before changing lifecycle state.');
  }
  const ids = operationIdentity(`reveal-${input.to}`);
  return executeWithReconciliation({
    rpcName: 'studio2_transition_reveal_v3',
    args: {
      p_show_id: input.showId,
      p_to: input.to,
      p_reason: input.reason?.trim() || null,
      p_expected_version: input.expectedVersion,
      p_operation_id: ids.operationId,
      p_idempotency_key: ids.idempotencyKey,
    },
    request: {
      operationId: ids.operationId,
      showId: input.showId,
      expectedVersion: input.expectedVersion,
      expectedState: input.to,
    },
    client,
  });
}

export async function advanceReveal(input: {
  showId: string;
  expectedVersion: number;
}, client?: RpcClient) {
  if (!input.showId || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error('Reload Reveal Director before advancing the reveal.');
  }
  const ids = operationIdentity('reveal-advance');
  return executeWithReconciliation({
    rpcName: 'studio2_advance_reveal_v3',
    args: {
      p_show_id: input.showId,
      p_expected_version: input.expectedVersion,
      p_operation_id: ids.operationId,
      p_idempotency_key: ids.idempotencyKey,
    },
    request: {
      operationId: ids.operationId,
      showId: input.showId,
      expectedVersion: input.expectedVersion,
      expectedState: 'live',
    },
    client,
  });
}
