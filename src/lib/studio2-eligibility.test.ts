import { describe, expect, it } from 'vitest';

import { buildStudio2HodWorkspaceSnapshot, type Studio2HodContext } from './studio2-hod-workspace';
import {
  applyStudio2EligibilityOverridesToReadiness,
  buildStudio2EligibilityCountry,
  isStudio2EligibilityOverrideActive,
  type Studio2EligibilityOverride,
} from './studio2-eligibility';

const context: Studio2HodContext = {
  editionId: 'edition-22',
  editionName: 'SSC 22',
  countryId: 'country-oland',
  countryName: 'Oland',
  confirmationComplete: true,
  participantStatus: 'confirmed',
  publicationStatus: 'published',
  entry: {
    id: 'entry-1',
    artist: 'Artist',
    songTitle: 'Song',
    songUrl: 'https://example.com/video',
    status: 'confirmed',
    source: 'confirmations',
    metadata: {},
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  juryMembersRequired: 1,
  juryMembersAssigned: 1,
  juryMembers: [],
  juryBallotSubmitted: false,
  notices: [],
  deadlines: [],
  reviewHistory: [],
  unresolvedOrganizerIssues: 0,
};

function override(rule: string, patch: Partial<Studio2EligibilityOverride> = {}): Studio2EligibilityOverride {
  return {
    id: `override-${rule}`,
    editionId: context.editionId,
    countryId: context.countryId,
    countryName: context.countryName,
    affectedRule: rule,
    reason: 'Organizer accepted this exception for testing.',
    createdBy: 'user-1',
    createdAt: '2026-09-10T10:00:00Z',
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    ...patch,
  };
}

describe('Studio 2 eligibility decision model', () => {
  it('keeps a fully ready delegation eligible', () => {
    const result = buildStudio2EligibilityCountry(
      buildStudio2HodWorkspaceSnapshot(context),
      [],
      new Date('2026-09-11T10:00:00Z'),
    );

    expect(result.overall).toBe('eligible');
    expect(result.issues).toEqual([]);
  });

  it('distinguishes factual blockers from organizer overrides', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({ ...context, confirmationComplete: false });
    const result = buildStudio2EligibilityCountry(
      snapshot,
      [override('participation')],
      new Date('2026-09-11T10:00:00Z'),
    );

    const participation = result.rules.find((rule) => rule.id === 'participation');
    expect(participation?.factualStatus).toBe('blocked');
    expect(participation?.effectiveStatus).toBe('overridden');
    expect(result.factualOverall).toBe('blocked');
    expect(result.overall).toBe('overridden');
  });

  it('assigns dedicated eligibility failures to their operational rules only', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...context,
      confirmationComplete: false,
      entry: {
        ...context.entry!,
        songUrl: null,
        status: 'pending',
      },
    });
    const result = buildStudio2EligibilityCountry(snapshot, [], new Date('2026-09-11T10:00:00Z'));

    expect(result.rules.find((rule) => rule.id === 'participation')?.factualStatus).toBe('blocked');
    expect(result.rules.find((rule) => rule.id === 'entry-approval')?.factualStatus).toBe('incomplete');
    expect(result.rules.find((rule) => rule.id === 'media')?.factualStatus).toBe('incomplete');
    expect(result.rules.find((rule) => rule.id === 'entry-validity')?.factualStatus).toBe('eligible');
  });

  it('does not let one override hide an unrelated blocker', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...context,
      confirmationComplete: false,
      entry: { ...context.entry!, artist: null },
    });
    const result = buildStudio2EligibilityCountry(
      snapshot,
      [override('participation')],
      new Date('2026-09-11T10:00:00Z'),
    );

    expect(result.overall).toBe('blocked');
    expect(result.rules.find((rule) => rule.id === 'entry-validity')?.effectiveStatus).toBe('blocked');
  });

  it('treats a missing HOD jury separately from a hard blocker', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({ ...context, juryMembersAssigned: 0 });
    const result = buildStudio2EligibilityCountry(snapshot, [], new Date('2026-09-11T10:00:00Z'));

    expect(result.jury).toBe('incomplete');
    expect(result.overall).toBe('incomplete');
    expect(result.rules.find((rule) => rule.id === 'jury')?.evidence).toEqual(
      expect.arrayContaining(['Required: 1', 'Assigned: 0']),
    );
  });

  it('removes only the overridden signal from Action Center effective readiness', () => {
    const snapshot = buildStudio2HodWorkspaceSnapshot({
      ...context,
      confirmationComplete: false,
      juryMembersAssigned: 0,
    });
    const effective = applyStudio2EligibilityOverridesToReadiness(
      snapshot,
      [override('participation')],
      new Date('2026-09-11T10:00:00Z'),
    );

    expect(effective.blockers.map((signal) => signal.id)).not.toContain('participation');
    expect(effective.blockers.map((signal) => signal.id)).not.toContain('entry-validity');
    expect(effective.state).toBe('attention_required');
    expect(effective.attention.map((signal) => signal.id)).toContain('jury');
  });

  it('ignores expired and revoked overrides', () => {
    const now = new Date('2026-09-11T10:00:00Z');
    expect(isStudio2EligibilityOverrideActive(override('jury', { expiresAt: '2026-09-11T09:59:59Z' }), now)).toBe(false);
    expect(isStudio2EligibilityOverrideActive(override('jury', { revokedAt: '2026-09-11T09:00:00Z' }), now)).toBe(false);
    expect(isStudio2EligibilityOverrideActive(override('jury', { expiresAt: '2026-09-11T11:00:00Z' }), now)).toBe(true);
  });
});
