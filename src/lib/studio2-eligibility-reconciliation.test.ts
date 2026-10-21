import { describe, expect, it } from 'vitest';

import { applyStudio2EligibilityOverrideChange } from './studio2-eligibility';

const input = {
  action: 'create' as const,
  editionId: 'edition-1',
  countryId: 'country-1',
  affectedRule: 'jury',
  overrideId: null,
  reason: 'Approved operational exception',
  expiresAt: null,
  operationId: 'operation-1',
  idempotencyKey: 'idempotency-1',
  expectedVersion: 4,
};

const result = {
  id: 'override-1',
  editionId: input.editionId,
  countryId: input.countryId,
  countryName: 'Oland',
  affectedRule: input.affectedRule,
  reason: input.reason,
  createdBy: 'actor-1',
  createdAt: '2026-10-21T16:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  revocationReason: null,
  ok: true,
  riskClass: 'R2',
  action: input.action,
  operationId: input.operationId,
  previousVersion: 4,
  version: 5,
};

function reconciledReceipt(overrides: Record<string, unknown> = {}) {
  return {
    operationId: input.operationId,
    correlationId: input.operationId,
    command: `eligibility.override.${input.action}`,
    status: 'succeeded',
    replayed: true,
    result,
    createdAt: '2026-10-21T16:00:00.000Z',
    updatedAt: '2026-10-21T16:00:01.000Z',
    completedAt: '2026-10-21T16:00:01.000Z',
    ...overrides,
  };
}

describe('Studio 2 eligibility override uncertain-result reconciliation', () => {
  it('returns a directly acknowledged exact operation without reconciliation', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const client = {
      async rpc(name: string, args?: Record<string, unknown>) {
        calls.push([name, args]);
        return { data: result, error: null };
      },
    };

    const receipt = await applyStudio2EligibilityOverrideChange(input, client as any);

    expect(receipt.operationId).toBe(input.operationId);
    expect(receipt.version).toBe(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('studio2_apply_eligibility_override_change');
    expect(calls[0]?.[1]?.p_operation_id).toBe(input.operationId);
    expect(calls[0]?.[1]?.p_idempotency_key).toBe(input.idempotencyKey);
  });

  it('recovers a lost successful apply response through the same operation ledger entry', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const lostResponse = new Error('transport closed after commit');
    const client = {
      async rpc(name: string, args?: Record<string, unknown>) {
        calls.push([name, args]);
        if (name === 'studio2_apply_eligibility_override_change') {
          return { data: null, error: lostResponse };
        }
        if (name === 'studio2_reconcile_operation') {
          return { data: reconciledReceipt(), error: null };
        }
        throw new Error(`Unexpected RPC ${name}`);
      },
    };

    const receipt = await applyStudio2EligibilityOverrideChange(input, client as any);

    expect(receipt.operationId).toBe(input.operationId);
    expect(receipt.editionId).toBe(input.editionId);
    expect(receipt.countryId).toBe(input.countryId);
    expect(receipt.affectedRule).toBe(input.affectedRule);
    expect(calls.map(([name]) => name)).toEqual([
      'studio2_apply_eligibility_override_change',
      'studio2_reconcile_operation',
    ]);
    expect(calls[1]?.[1]).toEqual({ p_operation_id: input.operationId });
  });

  it('does not accept another command as proof that the reviewed operation succeeded', async () => {
    const applyError = new Error('ambiguous apply outcome');
    const calls: string[] = [];
    const client = {
      async rpc(name: string) {
        calls.push(name);
        if (name === 'studio2_apply_eligibility_override_change') {
          return { data: null, error: applyError };
        }
        return {
          data: reconciledReceipt({ command: 'participation.status.confirmed' }),
          error: null,
        };
      },
    };

    await expect(applyStudio2EligibilityOverrideChange(input, client as any)).rejects.toBe(applyError);
    expect(calls).toEqual([
      'studio2_apply_eligibility_override_change',
      'studio2_reconcile_operation',
    ]);
  });

  it('does not accept mismatched result scope from a succeeded ledger receipt', async () => {
    const applyError = new Error('ambiguous apply outcome');
    let applyCalls = 0;
    const client = {
      async rpc(name: string) {
        if (name === 'studio2_apply_eligibility_override_change') {
          applyCalls += 1;
          return { data: null, error: applyError };
        }
        return {
          data: reconciledReceipt({
            result: { ...result, countryId: 'country-2' },
          }),
          error: null,
        };
      },
    };

    await expect(applyStudio2EligibilityOverrideChange(input, client as any)).rejects.toBe(applyError);
    expect(applyCalls).toBe(1);
  });

  it('keeps revoke reconciliation bound to the exact reviewed override', async () => {
    const revokeInput = {
      ...input,
      action: 'revoke' as const,
      overrideId: 'override-1',
      operationId: 'operation-revoke-1',
      idempotencyKey: 'idempotency-revoke-1',
    };
    const revokeResult = {
      ...result,
      action: 'revoke',
      operationId: revokeInput.operationId,
      revokedAt: '2026-10-21T16:01:00.000Z',
      revokedBy: 'actor-1',
      revocationReason: revokeInput.reason,
    };
    const client = {
      async rpc(name: string) {
        if (name === 'studio2_apply_eligibility_override_change') {
          return { data: null, error: new Error('response lost') };
        }
        return {
          data: {
            ...reconciledReceipt(),
            operationId: revokeInput.operationId,
            correlationId: revokeInput.operationId,
            command: 'eligibility.override.revoke',
            result: revokeResult,
          },
          error: null,
        };
      },
    };

    const receipt = await applyStudio2EligibilityOverrideChange(revokeInput, client as any);
    expect(receipt.id).toBe(revokeInput.overrideId);
    expect(receipt.action).toBe('revoke');
    expect(receipt.operationId).toBe(revokeInput.operationId);
  });
});
