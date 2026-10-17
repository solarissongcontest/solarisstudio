import { supabase } from '@/integrations/supabase/client';

import { mapStudio2RuntimeRow, type Studio2RuntimeRecord } from './studio2-persistence';

export type V3ArchiveEditionRequest = {
  editionId: string;
  expectedVersion: number;
  operationId: string;
  idempotencyKey: string;
  reason?: string | null;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type ArchiveCommandClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function mapArchiveResult(value: unknown): Studio2RuntimeRecord {
  const result = expectObject(value, 'Archive command result');
  return mapStudio2RuntimeRow(result.runtime);
}

export async function archiveEditionV3(
  request: V3ArchiveEditionRequest,
  client: ArchiveCommandClient = supabase as unknown as ArchiveCommandClient,
): Promise<Studio2RuntimeRecord> {
  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new Error('Archive requires the current edition runtime version.');
  }
  if (!request.operationId || !request.idempotencyKey) {
    throw new Error('Archive requires stable operation and idempotency identity.');
  }

  const { data, error } = await client.rpc('studio2_archive_edition_v3', {
    p_edition_id: request.editionId,
    p_expected_version: request.expectedVersion,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
    p_reason: request.reason ?? null,
  });

  if (!error) return mapArchiveResult(data);

  // The write may have committed even if the browser lost the response. Perform
  // exactly one bounded reconciliation using the same durable operation id.
  const reconciliation = await client.rpc('studio2_reconcile_operation', {
    p_operation_id: request.operationId,
  });
  if (!reconciliation.error) {
    const receipt = expectObject(reconciliation.data, 'Archive operation receipt');
    if (receipt.status === 'succeeded' && receipt.result) {
      return mapArchiveResult(receipt.result);
    }
  }

  throw error;
}
