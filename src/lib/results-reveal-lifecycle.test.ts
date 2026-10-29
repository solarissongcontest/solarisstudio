import { describe, expect, it } from 'vitest';

import {
  advanceReveal,
  availableRevealTransitions,
  isRevealArmable,
  loadRevealDirectorSnapshot,
  parseRevealDirectorRow,
  transitionReveal,
  type RevealOperationResult,
} from './results-reveal-lifecycle';

type RpcResponse = { data: unknown; error: unknown };
type TestRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): Promise<RpcResponse>;
};

function operationResult(input: Partial<RevealOperationResult> = {}): RevealOperationResult {
  return {
    operationId: '11111111-1111-4111-8111-111111111111',
    editionId: '22222222-2222-4222-8222-222222222222',
    showId: '33333333-3333-4333-8333-333333333333',
    state: 'armed',
    strategy: 'jury_order',
    sequence: ['a', 'b'],
    lockedResultVersion: 4,
    currentStep: 0,
    totalSteps: 2,
    previousVersion: 7,
    version: 8,
    revealedId: null,
    replayed: false,
    updatedAt: '2026-10-26T18:00:00.000Z',
    ...input,
  };
}

describe('Reveal Director lifecycle client', () => {
  it('exposes only canonical allowed lifecycle edges', () => {
    expect(availableRevealTransitions('planning')).toEqual(['rehearsal', 'armed']);
    expect(availableRevealTransitions('rehearsal')).toEqual(['planning', 'armed']);
    expect(availableRevealTransitions('armed')).toEqual(['rehearsal', 'live']);
    expect(availableRevealTransitions('live')).toEqual(['complete']);
    expect(availableRevealTransitions('complete')).toEqual([]);
  });

  it('requires the current exact Result version to be reveal-ready before arming', () => {
    expect(isRevealArmable({ calculationVersion: 4, revealReadyVersion: 4, sequence: ['a'] })).toBe(true);
    expect(isRevealArmable({ calculationVersion: 4, revealReadyVersion: 3, sequence: ['a'] })).toBe(false);
    expect(isRevealArmable({ calculationVersion: 4, revealReadyVersion: 4, sequence: [] })).toBe(false);
  });

  it('parses the authoritative organizer snapshot instead of inferring state in React', async () => {
    const row = {
      showId: 'show-1',
      showName: 'Grand Final',
      showKind: 'grand-final',
      sortOrder: 3,
      state: 'rehearsal',
      version: 5,
      strategy: 'jury_order',
      sequence: ['a', 'b'],
      lockedResultVersion: null,
      currentStep: 0,
      totalSteps: 2,
      calculationVersion: 9,
      revealReadyVersion: 9,
      canManagePlan: true,
      canControl: true,
      updatedAt: '2026-10-26T18:00:00.000Z',
    };
    const client: TestRpcClient = {
      rpc: async (name) => ({ data: name === 'studio2_reveal_director_snapshot' ? [row] : null, error: null }),
    };

    await expect(loadRevealDirectorSnapshot('edition-1', client)).resolves.toEqual([
      parseRevealDirectorRow(row),
    ]);
  });

  it('reconciles a lost transition response by exact operation/show/version/state receipt', async () => {
    let operationId = '';
    let showId = '';
    let expectedVersion = 0;
    let call = 0;
    const client: TestRpcClient = {
      rpc: async (name, args = {}) => {
        call += 1;
        if (name === 'studio2_transition_reveal_v3') {
          operationId = String(args.p_operation_id);
          showId = String(args.p_show_id);
          expectedVersion = Number(args.p_expected_version);
          return { data: null, error: new Error('transport lost after commit') };
        }
        expect(name).toBe('studio2_reconcile_operation');
        return {
          data: {
            status: 'succeeded',
            result: operationResult({
              operationId,
              showId,
              state: 'armed',
              previousVersion: expectedVersion,
              version: expectedVersion + 1,
            }),
          },
          error: null,
        };
      },
    };

    const result = await transitionReveal({
      showId: 'show-1',
      to: 'armed',
      expectedVersion: 7,
    }, client);

    expect(call).toBe(2);
    expect(result.state).toBe('armed');
    expect(result.previousVersion).toBe(7);
    expect(result.version).toBe(8);
  });

  it('does not accept a contradictory reconciliation receipt after an uncertain command', async () => {
    const original = new Error('command failed');
    const client: TestRpcClient = {
      rpc: async (name, args = {}) => {
        if (name === 'studio2_advance_reveal_v3') return { data: null, error: original };
        return {
          data: {
            status: 'succeeded',
            result: operationResult({
              operationId: String(args.p_operation_id ?? 'wrong-operation'),
              showId: 'different-show',
              state: 'live',
              previousVersion: 7,
              version: 8,
            }),
          },
          error: null,
        };
      },
    };

    await expect(advanceReveal({ showId: 'show-1', expectedVersion: 7 }, client)).rejects.toBe(original);
  });
});
