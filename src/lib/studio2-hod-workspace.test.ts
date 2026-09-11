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
  juryMembersRequired: 5,
  juryMembersAssigned: 5,
  juryMembers: [],
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

  it('surfaces entry, jury and notice blockers without inventing missing artwork requirements', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...completeContext,
      confirmationComplete: false,
      participantStatus: 'pending',
      publicationStatus: 'draft',
      entry: {
        id: 'entry-1',
        artist: 'Artist',
        songTitle: 'Song',
        songUrl: null,
        status: 'pending',
        source: 'confirmations',
        metadata: {},
        createdAt: '2026-09-11T10:00:00.000Z',
        updatedAt: '2026-09-11T11:00:00.000Z',
      },
      juryMembersAssigned: 3,
      juryBallotSubmitted: false,
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

    expect(snapshot.eligibility.blockers.map((check) => check.id)).toEqual(
      expect.arrayContaining(['country-confirmed', 'video', 'broadcaster-approval']),
    );
    expect(snapshot.eligibility.checks.map((check) => check.id)).not.toContain('artwork');
    expect(snapshot.model.actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['confirmation', 'entry-blocked', 'jury-members', 'official-notices']),
    );
    expect(snapshot.model.outstandingAcknowledgements).toBe(1);
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

  it('validates the secure RPC payload before it reaches the domain engines', () => {
    expect(() =>
      mapStudio2HodContext({
        editionId: 'edition-21',
        editionName: 'SSC 21',
        countryId: 'oland',
        countryName: 'Oland',
        confirmationComplete: true,
        participantStatus: 'confirmed',
        publicationStatus: 'published',
        entry: null,
        juryMembersRequired: 5,
        juryMembersAssigned: 5,
        juryMembers: [],
        juryBallotSubmitted: true,
        notices: [
          {
            id: 'notice-1',
            title: 'Impossible severity',
            severity: 'catastrophic-plus',
            acknowledgementRequired: true,
            acknowledged: false,
          },
        ],
        deadlines: [],
        reviewHistory: [],
        unresolvedOrganizerIssues: 0,
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
  });
});
