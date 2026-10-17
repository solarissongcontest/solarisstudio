import { supabase } from '@/integrations/supabase/client';

import {
  mapStudio2RuntimeRow,
  type Studio2RuntimeRecord,
  type Studio2TransitionEditionRequest,
} from './studio2-persistence';

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Invalid ${label}: expected a string`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected a finite number`);
  }
  return value;
}

function mapTransitionResult(
  value: unknown,
  request: Studio2TransitionEditionRequest,
): Studio2RuntimeRecord {
  const result = expectObject(value, 'edition transition result');
  const editionId = expectString(result.editionId, 'transition edition id');
  const state = expectString(result.state, 'transition state');
  const runtimeVersion = expectNumber(result.runtimeVersion, 'transition runtime version');
  const runtime = mapStudio2RuntimeRow(result.runtime);

  if (editionId !== request.editionId || runtime.editionId !== request.editionId) {
    throw new Error('Edition transition returned a different edition than requested.');
  }
  if (state !== request.to || runtime.runtime.edition !== request.to) {
    throw new Error('Edition transition receipt disagrees with the requested destination state.');
  }
  if (runtime.version !== runtimeVersion) {
    throw new Error('Edition transition receipt disagrees with canonical runtime version.');
  }

  return runtime;
}

function mapReconciledTransition(
  value: unknown,
  request: Studio2TransitionEditionRequest,
): Studio2RuntimeRecord | null {
  const receipt = expectObject(value, 'edition transition reconciliation');
  if (receipt.status !== 'succeeded' || receipt.result === null || receipt.result === undefined) {
    return null;
  }
  return mapTransitionResult(receipt.result, request);
}

/**
 * Execute the canonical V3 lifecycle command.
 *
 * The caller must pass the exact runtime version currently shown to the
 * operator plus stable operation/idempotency identity. A failed transport is
 * reconciled exactly once by operation id before the original mutation error
 * is surfaced, preventing an unsafe blind retry.
 */
export async function transitionEditionV3(
  request: Studio2TransitionEditionRequest,
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<Studio2RuntimeRecord> {
  if (!Number.isInteger(request.expectedVersion) || (request.expectedVersion ?? 0) < 1) {
    throw new Error('Refresh the Control Room before changing edition state.');
  }
  if (!request.operationId || !request.idempotencyKey) {
    throw new Error('Edition transition requires stable operation identity.');
  }

  const { data, error } = await client.rpc('studio2_transition_edition_v3', {
    p_edition_id: request.editionId,
    p_to: request.to,
    p_reason: request.reason ?? null,
    p_approval_request_id: request.approvalRequestId ?? null,
    p_expected_version: request.expectedVersion,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
  });

  if (!error) return mapTransitionResult(data, request);

  const { data: reconciliation, error: reconciliationError } = await client.rpc(
    'studio2_reconcile_operation',
    { p_operation_id: request.operationId },
  );

  if (!reconciliationError) {
    try {
      const reconciled = mapReconciledTransition(reconciliation, request);
      if (reconciled) return reconciled;
    } catch {
      // The mutation error remains authoritative if the receipt is malformed
      // or contradicts the exact edition/state the caller requested.
    }
  }

  throw error;
}
