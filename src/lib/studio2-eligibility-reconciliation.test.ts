import { describe, expect, it, vi } from 'vitest';

import { applyStudio2EligibilityOverrideChange } from './studio2-eligibility';

const input = {
  action: 'create' as const,
  editionId: '11111111-1111-4111-8111-111111111111',
  countryId: '22222222-2222-4222-8222-222222222222',
  affectedRule: 'entry-approval',
  overrideId: null,
  reason: 'Approved exception for this rehearsal.',
  expiresAt: null,
  operationId: '33333333-3333-4333-8333-333333333333',
  idempotencyKey: 'eligibility-test-operation',
  expectedVersion: 2,
};

function result() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    editionId: input.editionId,
    countryId: input.countryId,
    countryName: 'Oland',
    affectedRule: input.affectedRule,
    reason: input.reason,
    createdBy: null,
    createdAt: '2026-10-25T00:00:00.000Z',
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    ok: true,
    riskClass: 'R2',
    action: input.action,
    operationId: input.operationId,
    previousVersion: input.expectedVersion,
    version: input.expectedVersion + 1,
  };
}

function reconciliation(status: string, operationResult: unknown = null) {
  return {
    operationId: input.operationId,
    correlationId: input.operationId,
    command: `eligibility.override.${input.action}`,
    status,
    result: operationResult,
    error: null,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:01.000Z',
    completedAt: status === 'succeeded' ? '2026-10-25T00:00:01.000Z' : null,
  };
}

const missing = { code: 'P0002', message: 'UNKNOWN' };

describe('Organizer eligibility override reconciliation', () => {
  it('proves a fresh operation is absent before the first mutation', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'studio2_reconcile_operation') return { data: null, error: missing };
      if (name === 'studio2_apply_eligibility_override_change') return { data: result(), error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });

    const receipt = await applyStudio2EligibilityOverrideChange(input, { rpc });

    expect(receipt.version).toBe(3);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'studio2_reconcile_operation',
      'studio2_apply_eligibility_override_change',
    ]);
  });

  it('returns an existing canonical success without replaying the mutation', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'studio2_reconcile_operation') {
        return { data: reconciliation('succeeded', result()), error: null };
      }
      throw new Error(`Mutation must not replay after reconciled success: ${name}`);
    });

    const receipt = await applyStudio2EligibilityOverrideChange(input, { rpc });

    expect(receipt.operationId).toBe(input.operationId);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('recovers a lost successful response through the same operation receipt', async () => {
    let reconcileCount = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'studio2_reconcile_operation') {
        reconcileCount += 1;
        return reconcileCount === 1
          ? { data: null, error: missing }
          : { data: reconciliation('succeeded', result()), error: null };
      }
      if (name === 'studio2_apply_eligibility_override_change') {
        return { data: null, error: { code: 'FETCH_ERROR', message: 'response lost' } };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const receipt = await applyStudio2EligibilityOverrideChange(input, { rpc });

    expect(receipt.operationId).toBe(input.operationId);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'studio2_reconcile_operation',
      'studio2_apply_eligibility_override_change',
      'studio2_reconcile_operation',
    ]);
  });

  it.each(['processing', 'uncertain'])('fails closed while an existing operation is %s', async (status) => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'studio2_reconcile_operation') {
        return { data: reconciliation(status), error: null };
      }
      throw new Error(`Mutation must not run while ${status}: ${name}`);
    });

    await expect(applyStudio2EligibilityOverrideChange(input, { rpc })).rejects.toThrow(
      'outcome is still unresolved',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails closed when reconciliation is unavailable instead of guessing the operation is new', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'studio2_reconcile_operation') {
        return { data: null, error: { code: 'TIMEOUT', message: 'reconciliation unavailable' } };
      }
      throw new Error(`Mutation must not run without reconciliation evidence: ${name}`);
    });

    await expect(applyStudio2EligibilityOverrideChange(input, { rpc })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects a receipt for another command even when the operation id matches', async () => {
    const rpc = vi.fn(async () => ({
      data: { ...reconciliation('succeeded', result()), command: 'jury.round.close' },
      error: null,
    }));

    await expect(applyStudio2EligibilityOverrideChange(input, { rpc })).rejects.toThrow(
      'different command',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
