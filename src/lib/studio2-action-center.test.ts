import { describe, expect, it } from 'vitest';

import { getCountryOperationalReadiness } from './country-operational-readiness';
import type { ContestEvent } from './contest-events';
import type { Participant, Show } from './data';
import type { Studio2IncidentRecord, Studio2RuntimeRecord, Studio2TransitionApprovalRecord } from './studio2-persistence';
import { buildStudio2ActionCenter } from './studio2-action-center';

const runtime: Studio2RuntimeRecord = {
  editionId: 'edition-1',
  runtime: {
    edition: 'pre_show',
    subsystems: {
      confirmations: 'locked',
      submissions: 'paused',
      juryVoting: 'not_started',
      televoting: 'not_started',
      results: 'not_started',
      predictions: 'open',
    },
  },
  version: 1,
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
  updatedBy: null,
};

const participant: Participant = {
  id: 'participant-1',
  edition_id: 'edition-1',
  show_id: null,
  country_id: 'country-1',
  contest_entity_id: null,
  artist: 'Artist',
  song: null,
  running_order: null,
  semi_final: '',
  qualified: null,
  notes: null,
};

const show: Show = {
  id: 'show-1',
  edition_id: 'edition-1',
  name: 'Grand Final',
  kind: 'grand-final',
  sort_order: 1,
  published: false,
  status: 'draft',
  qualifier_count: null,
  theme_id: null,
  voting_config: null,
  broadcast_config: {},
  publication_config: null,
};

const incident: Studio2IncidentRecord = {
  id: 'incident-1',
  editionId: 'edition-1',
  title: 'Voting outage',
  severity: 'sev1',
  category: 'voting',
  status: 'open',
  affectedSystems: ['televote'],
  description: 'Voting feed is unavailable.',
  commanderId: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolution: null,
  postmortem: null,
  crisisDeclaredAt: null,
  crisisDeclaredBy: null,
  startedAt: '2026-09-11T10:05:00.000Z',
  resolvedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-09-11T10:05:00.000Z',
  updatedAt: '2026-09-11T10:05:00.000Z',
};

const approval: Studio2TransitionApprovalRecord = {
  id: 'approval-1',
  editionId: 'edition-1',
  from: 'pre_show',
  to: 'rehearsals',
  reason: 'Ready for rehearsals',
  requestedBy: 'user-1',
  requestedAt: '2026-09-11T10:10:00.000Z',
  expiresAt: '2026-09-11T10:25:00.000Z',
  approvedBy: null,
  approvedAt: null,
  canApprove: true,
  canApply: false,
};

const event: ContestEvent = {
  id: 'event-1',
  editionId: 'edition-1',
  type: 'entry.changed',
  occurredAt: '2026-09-11T10:15:00.000Z',
  actorUserId: null,
  entityType: 'entry',
  entityId: 'entry-1',
  payload: {},
};

describe('Studio 2 Action Center', () => {
  it('aggregates incidents, approvals, paused subsystems and incomplete entries', () => {
    const model = buildStudio2ActionCenter({
      runtime,
      incidents: [incident],
      approvals: [approval],
      participants: [participant],
      shows: [show],
      recentEvents: [event],
      editionSlug: 'ssc-21',
      broadcastRundownEnabled: true,
    });

    expect(model.critical.some((item) => item.source === 'incident')).toBe(true);
    expect(model.attention.some((item) => item.id === 'subsystem:submissions')).toBe(true);
    expect(model.attention.some((item) => item.id === 'entry:incomplete-participants')).toBe(true);
    expect(model.attention.some((item) => item.id === 'broadcast:missing-rundown')).toBe(true);
    expect(model.attention.some((item) => item.id === 'transition:approval-1')).toBe(true);
    expect(model.upcoming.some((item) => item.title.includes('Rehearsals'))).toBe(true);
    expect(model.recent[0]?.title).toBe('Entry changed');
  });

  it('surfaces the shared country readiness model as organizer work', () => {
    const blockedReadiness = getCountryOperationalReadiness({
      participationConfirmed: false,
      entryPresent: false,
      entryEligibility: { status: 'blocked' },
      entryApproved: false,
      mediaAvailable: false,
      juryComplete: false,
      deadlines: [],
      unresolvedOrganizerIssues: 0,
    });
    const attentionReadiness = getCountryOperationalReadiness({
      participationConfirmed: true,
      entryPresent: true,
      entryEligibility: { status: 'ready' },
      entryApproved: true,
      mediaAvailable: true,
      juryComplete: false,
      deadlines: [],
      unresolvedOrganizerIssues: 0,
    });

    const model = buildStudio2ActionCenter({
      runtime,
      incidents: [],
      approvals: [],
      participants: [],
      shows: [],
      recentEvents: [],
      countryReadiness: [
        { countryId: 'oland', countryName: 'Oland', readiness: blockedReadiness },
        { countryId: 'cilestia', countryName: 'Cilestia', readiness: attentionReadiness },
      ],
    });

    expect(model.critical).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'country:oland', source: 'country', href: '/admin/countries/oland' }),
      ]),
    );
    expect(model.attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'country:cilestia', source: 'country', href: '/admin/countries/cilestia' }),
      ]),
    );
  });

  it('does not flag missing entry details before submissions are operationally relevant', () => {
    const model = buildStudio2ActionCenter({
      runtime: {
        ...runtime,
        runtime: { ...runtime.runtime, edition: 'confirmations' },
      },
      incidents: [],
      approvals: [],
      participants: [participant],
      shows: [],
      recentEvents: [],
      editionSlug: 'ssc-21',
      broadcastRundownEnabled: true,
    });

    expect(model.attention.some((item) => item.source === 'entry')).toBe(false);
    expect(model.attention.some((item) => item.source === 'broadcast')).toBe(false);
  });

  it('does not report resolved incidents as active work', () => {
    const model = buildStudio2ActionCenter({
      runtime,
      incidents: [{ ...incident, status: 'resolved', resolvedAt: '2026-09-11T10:20:00.000Z' }],
      approvals: [],
      participants: [],
      shows: [],
      recentEvents: [],
    });

    expect(model.critical).toEqual([]);
    expect(model.attention.some((item) => item.source === 'incident')).toBe(false);
  });
});
