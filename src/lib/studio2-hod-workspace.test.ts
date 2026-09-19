import { describe, expect, it, vi } from 'vitest';

import {
  buildStudio2HodWorkspaceSnapshot,
  createStudio2HodWorkspaceSource,
  mapStudio2HodContext,
  type Studio2HodContext,
} from './studio2-hod-workspace';

const completeContext: Studio2HodContext = {
  editionId: 'edition-21',
  editionName: 'SSC 21',
  countryId: 'oland',
  countryName: 'Oland',
  confirmationComplete: true,
  participantStatus: 'confirmed',
  publicationStatus: 'published',
  entry: {
    id: 'entry-1',
    artist: 'Artist',
    songTitle: 'Song',
    songUrl: 'https://example.com/song',
    status: 'confirmed',
    source: 'confirmations',
    metadata: {},
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T11:00:00.000Z',
  },
  juryMembersRequired: 1,
  juryMembersAssigned: 1,
  juryMembers: [
    {
      id: 'hod-assignment-1',
      displayName: 'Oland HOD',
      memberUserId: 'user-1',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  juryBallotSubmitted: true,
  notices: [],
  deadlines: [],
  reviewHistory: [],
  unresolvedOrganizerIssues: 0,
};

describe('Studio 2 HOD workspace adapter', () => {
  it('builds a clear workspace from complete legacy and Studio 2 data', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot(completeContext);

    expect(snapshot.eligibility.status).toBe('ready');
    expect(snapshot.workflow.complete).toBe(true);
    expect(snapshot.model.readiness).toBe(100);
    expect(snapshot.model.actions).toEqual([]);
  });

  it('treats a pending confirmation entry as waiting for review instead of a blocked entry', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      publicationStatus: 'draft',
      entry: {
        id: 'entry-1',
        artist: null,
        songTitle: null,
        songUrl: null,
        status: 'pending',
        source: 'confirmations',
        metadata: {},
        createdAt: '2026-09-11T10:00:00.000Z',
        updatedAt: '2026-09-11T11:00:00.000Z',
      },
      notices: [
        {
          id: 'notice-1',
          title: 'Rule clarification',
          severity: 'critical',
          acknowledgementRequired: true,
          acknowledged: false,
        },
      ],
    });

    expect(snapshot.eligibility.status).toBe('warning');
    expect(snapshot.eligibility.blockers).toEqual([]);
    expect(snapshot.eligibility.checks.map((check) => check.id)).toContain('organizer-review');
    expect(snapshot.workflow.nextTaskIds).toContain('entry.broadcaster-approval');
    expect(snapshot.model.actions.map((action) => action.id)).not.toContain('entry-blocked');
    expect(snapshot.model.actions.map((action) => action.id)).not.toContain('entry-workflow');
    expect(snapshot.model.actions.map((action) => action.id)).toContain('official-notices');
    expect(snapshot.model.outstandingAcknowledgements).toBe(1);
  });

  it('treats missing performance media as readiness attention, not entry invalidity', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      entry: {
        ...completeContext.entry!,
        songUrl: null,
      },
    });

    expect(snapshot.eligibility.status).toBe('ready');
    expect(snapshot.eligibility.blockers).toEqual([]);
    expect(snapshot.operationalReadiness.signals.find((signal) => signal.id === 'media')?.state)
      .toBe('attention');
    expect(snapshot.model.actions.map((action) => action.id)).toContain('entry-workflow');
  });

  it('does not create a jury task merely because no ballot exists outside an open voting window', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      juryBallotSubmitted: false,
    });

    expect(snapshot.model.jury.complete).toBe(true);
    expect(snapshot.model.jury.ballotSubmitted).toBe(false);
    expect(snapshot.model.actions.map((action) => action.id)).not.toContain('jury-ballot');
  });

  it('honours an explicit entry lock marker before publication', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      publicationStatus: 'draft',
      entry: {
        ...completeContext.entry!,
        metadata: { entry_locked: true },
      },
    });

    expect(snapshot.workflow.complete).toBe(true);
    expect(snapshot.model.readiness).toBe(100);
  });

  it('passes canonical operational deadlines into the shared readiness engine', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      deadlines: [
        {
          id: 'deadline-1',
          kind: 'entry',
          label: 'Entry deadline',
          dueAt: '2026-01-01T00:00:00.000Z',
          completedAt: null,
          notes: null,
        },
      ],
    });

    expect(snapshot.operationalReadiness.state).toBe('blocked');
    expect(snapshot.operationalReadiness.overdueDeadlines).toHaveLength(1);
    expect(snapshot.model.actions.map((action) => action.id)).toContain('overdue-deadlines');
  });

  it('rejects any RPC payload that reintroduces a multi-member jury', () => {
    const payload = {
      ...completeContext,
      juryMembersRequired: 5,
      juryMembersAssigned: 1,
    };

    expect(() => mapStudio2HodContext(payload)).toThrow(
      'Invalid jury members required: Solaris requires exactly one HOD jury',
    );
  });

  it('rejects a jury projection whose count does not match the sole HOD row', () => {
    expect(() =>
      mapStudio2HodContext({
        ...completeContext,
        juryMembersAssigned: 1,
        juryMembers: [],
      }),
    ).toThrow('Invalid jury member projection: expected exactly the assigned HOD');
  });

  it('validates the secure RPC payload before it reaches the domain engines', () => {
    expect(() =>
      mapStudio2HodContext({
        ...completeContext,
        notices: [
          {
            id: 'notice-1',
            title: 'Impossible severity',
            severity: 'catastrophic-plus',
            acknowledgementRequired: true,
            acknowledged: false,
          },
        ],
      }),
    ).toThrow(/Unknown notice severity/);
  });

  it('calls the HOD context RPC with edition and country scope', async () => {
    const rpc = vi.fn(async () => ({ data: completeContext, error: null }));
    const source = createStudio2HodWorkspaceSource({ rpc });

    const result = await source.loadContext('edition-21', 'oland');

    expect(rpc).toHaveBeenCalledWith('studio2_hod_context', {
      p_edition_id: 'edition-21',
      p_country_id: 'oland',
    });
    expect(result.countryName).toBe('Oland');
    expect(result.juryMembers).toHaveLength(1);
    expect(result.juryMembersRequired).toBe(1);
  });
});
