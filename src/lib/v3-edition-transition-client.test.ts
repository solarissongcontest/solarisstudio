import { describe, expect, it, vi } from 'vitest';

import { transitionEditionV3 } from './v3-edition-transition-client';

const runtime = {
  edition_id: 'edition-1',
  state: 'post_edition',
  subsystems: {
    confirmations: 'closed',
    submissions: 'closed',
    juryVoting: 'closed',
    televoting: 'closed',
    results: 'published',
    predictions: 'closed',
  },
  version: 8,
  created_at: '2026-10-17T08:00:00.000Z',
  updated_at: '2026-10-17T09:00:00.000Z',
  updated_by: 'operator-1',
};

const request = {
  editionId: 'edition-1',
  to: 'post_edition' as const,
  reason: null,
  approvalRequestId: null,
  expectedVersion: 7,
  operationId: 'operation-1',
  idempotencyKey: 'edition-transition:operation-1',
};

const result = {
  ok: true,
  operationId: request.operationId,
  editionId: request.editionId,
  from: 'results',
  previousRuntimeVersion: 7,
  state: request.to,
  runtimeVersion: 8,
  serverTime: '2026-10-17T09:00:00.000Z',
  replayed: false,
  runtime,
};

describe('V3 edition transition client', () => {
  it('sends the reviewed version and stable operation identity to the canonical command', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });

    const transitioned = await transitionEditionV3(request, { rpc });

    expect(transitioned.version).toBe(8);
    expect(transitioned.runtime.edition).toBe('post_edition');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('studio2_transition_edition_v3', {
      p_edition_id: 'edition-1',
      p_to: 'post_edition',
      p_reason: null,
      p_approval_request_id: null,
      p_expected_version: 7,
      p_operation_id: 'operation-1',
      p_idempotency_key: 'edition-transition:operation-1',
    });
  });

  it('reconciles an uncertain mutation response by exact operation id before surfacing failure', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('transport lost') })
      .mockResolvedValueOnce({
        data: {
          operationId: request.operationId,
          status: 'succeeded',
          result,
        },
        error: null,
      });

    const transitioned = await transitionEditionV3(request, { rpc });

    expect(transitioned.version).toBe(8);
    expect(rpc).toHaveBeenNthCalledWith(2, 'studio2_reconcile_operation', {
      p_operation_id: request.operationId,
    });
  });

  it('refuses to invent concurrency or operation identity when the caller did not review it', async () => {
    const rpc = vi.fn();

    await expect(
      transitionEditionV3(
        { ...request, expectedVersion: null },
        { rpc },
      ),
    ).rejects.toThrow('Refresh the Control Room');
    await expect(
      transitionEditionV3(
        { ...request, operationId: null },
        { rpc },
      ),
    ).rejects.toThrow('stable operation identity');

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a contradictory authoritative result instead of showing false success', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...result, state: 'archived' },
      error: null,
    });

    await expect(transitionEditionV3(request, { rpc })).rejects.toThrow(
      'receipt disagrees with the requested destination state',
    );
  });
});
