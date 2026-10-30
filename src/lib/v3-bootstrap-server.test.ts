import { describe, expect, it, vi } from 'vitest';

import type { PublicContestState } from './current-contest-state';
import type { SolarisTask } from './participation-os';
import type { V3BootstrapServerSnapshot, V3BootstrapServerSource } from './v3-bootstrap-server';
import {
  createV3BootstrapRequestLoader,
  loadV3BootstrapProjection,
  v3BootstrapServerRequestKey,
} from './v3-bootstrap-server';

const publicContest: PublicContestState = {
  edition: {
    id: 'edition-22',
    edition_number: 22,
    name: 'Hanvør 2026',
    year: 2026,
    slug: 'hanvor-2026',
    description: null,
    host_country_id: null,
    host_city: 'Hanvør',
    logo: null,
    theme_id: null,
    status: 'submissions',
    published: true,
  },
  phase: 'submissions',
  lifecycle: 'submissions',
  statusKey: 'current',
  statusLabel: 'Current edition',
  headline: 'SSC 22 is the current Solaris edition',
  description: 'Current edition',
  primaryAction: { label: 'Explore edition', to: '/editions/hanvor-2026' },
};

function participantTask(overrides: Partial<SolarisTask> = {}): SolarisTask {
  return {
    id: 'confirmation:source-a',
    editionId: 'edition-22',
    kind: 'confirmation',
    title: 'Complete confirmation',
    description: 'Confirmation remains required.',
    state: 'needs_attention',
    importance: 'required',
    blocking: true,
    actionRequired: true,
    opensAt: null,
    deadline: null,
    route: '/confirmations',
    priority: 120,
    why: 'Canonical confirmation requirement remains unresolved.',
    ...overrides,
  };
}

function snapshot(overrides: Partial<V3BootstrapServerSnapshot> = {}): V3BootstrapServerSnapshot {
  return {
    publicContest,
    tasks: [],
    identity: { userId: 'user-1', displayName: 'Arthur' },
    delegation: { id: 'country-oland', name: 'Oland' },
    capabilities: ['entry.edit'],
    serverTime: '2026-10-12T04:00:00.000Z',
    generatedAt: '2026-10-12T04:00:00.100Z',
    hideResultSpoilers: true,
    ...overrides,
  };
}

const request = {
  viewerId: 'user-1',
  editionId: 'edition-22',
  delegationId: 'country-oland',
};

describe('V3 server bootstrap adapter', () => {
  it('loads one authorized snapshot and projects all shared V3 state from it', async () => {
    const loadSnapshot = vi.fn(async () => snapshot());
    const source: V3BootstrapServerSource = { loadSnapshot };

    const projection = await loadV3BootstrapProjection(request, source);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith(request);
    expect(projection.serverTime).toBe('2026-10-12T04:00:00.000Z');
    expect(projection.context.editionId).toBe('edition-22');
    expect(projection.context.delegationId).toBe('country-oland');
    expect(projection.capabilities).toEqual(['entry.edit']);
    expect(projection.actions).toEqual([]);
    expect(projection.taskProjection).toMatchObject({
      schemaVersion: 1,
      audience: 'participant',
      authoritativeSource: 'participant-task-engine',
      items: [],
    });
    expect(projection.journey).toBeDefined();
    expect(projection.home).toBeDefined();
  });

  it('reconciles duplicate semantic participant obligations once at the server boundary', async () => {
    const projection = await loadV3BootstrapProjection(request, {
      loadSnapshot: async () =>
        snapshot({
          tasks: [
            participantTask({
              id: 'hod:confirmation-complete',
              state: 'completed',
              actionRequired: false,
              blocking: false,
              priority: 70,
            }),
            participantTask({
              id: 'confirmation-required:req-1',
              state: 'problem',
              actionRequired: true,
              blocking: true,
              priority: 140,
            }),
          ],
        }),
    });

    expect(projection.taskProjection?.items).toHaveLength(1);
    expect(projection.taskProjection?.items[0]).toMatchObject({
      id: 'participant:edition-22:confirmation',
      state: 'blocked',
      actionRequired: true,
      blocking: true,
    });
    expect(projection.actions).toHaveLength(1);
    expect(projection.actions[0]?.id).toBe('participant:edition-22:confirmation');
    expect(projection.journey).toHaveLength(1);
  });

  it('coalesces concurrent identical loads inside one request-scoped loader', async () => {
    let release!: (value: V3BootstrapServerSnapshot) => void;
    const gate = new Promise<V3BootstrapServerSnapshot>((resolve) => {
      release = resolve;
    });
    const loadSnapshot = vi.fn(() => gate);
    const loader = createV3BootstrapRequestLoader({ loadSnapshot });

    const first = loader.load(request);
    const second = loader.load({ ...request });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    release(snapshot());
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce different viewer, edition or delegation scopes', async () => {
    const loadSnapshot = vi.fn(async (input: typeof request) =>
      snapshot({
        identity: { userId: input.viewerId, displayName: null },
        delegation: input.delegationId ? { id: input.delegationId, name: input.delegationId } : null,
        publicContest:
          input.editionId === 'edition-23'
            ? {
                ...publicContest,
                edition: { ...publicContest.edition!, id: 'edition-23', edition_number: 23 },
              }
            : publicContest,
      }),
    );
    const loader = createV3BootstrapRequestLoader({ loadSnapshot });

    await Promise.all([
      loader.load(request),
      loader.load({ ...request, viewerId: 'user-2' }),
      loader.load({ ...request, editionId: 'edition-23' }),
      loader.load({ ...request, delegationId: 'country-vendia' }),
    ]);

    expect(loadSnapshot).toHaveBeenCalledTimes(4);
  });

  it('fails closed when the authorized snapshot belongs to another viewer', async () => {
    await expect(
      loadV3BootstrapProjection(request, {
        loadSnapshot: async () => snapshot({ identity: { userId: 'user-other', displayName: null } }),
      }),
    ).rejects.toThrow(/viewer identity/);
  });

  it('fails closed when explicit edition or delegation context mismatches', async () => {
    await expect(
      loadV3BootstrapProjection(request, {
        loadSnapshot: async () =>
          snapshot({ publicContest: { ...publicContest, edition: { ...publicContest.edition!, id: 'edition-other' } } }),
      }),
    ).rejects.toThrow(/edition/);

    await expect(
      loadV3BootstrapProjection(request, {
        loadSnapshot: async () => snapshot({ delegation: { id: 'country-other', name: 'Other' } }),
      }),
    ).rejects.toThrow(/delegation/);
  });

  it('evicts a failed in-request load so a canonical retry can re-read state', async () => {
    const loadSnapshot = vi
      .fn<() => Promise<V3BootstrapServerSnapshot>>()
      .mockRejectedValueOnce(new Error('temporary canonical read failure'))
      .mockResolvedValueOnce(snapshot());
    const loader = createV3BootstrapRequestLoader({ loadSnapshot });

    await expect(loader.load(request)).rejects.toThrow(/temporary canonical read failure/);
    await expect(loader.load(request)).resolves.toMatchObject({ serverTime: snapshot().serverTime });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it('uses unambiguous length-prefixed request keys', () => {
    expect(v3BootstrapServerRequestKey(request)).not.toBe(
      v3BootstrapServerRequestKey({ viewerId: 'user-1|10', editionId: 'edition-22', delegationId: 'country-oland' }),
    );
  });
});
