import { describe, expect, it } from 'vitest';
import type { ContestEvent } from './contest-events';
import { buildScoreReplay, reconstructEditionState } from './timeline-replay';

const stateEvents: ContestEvent[] = [
  {
    id: 'e1',
    editionId: 'ssc21',
    type: 'edition.state_changed',
    occurredAt: '2026-09-10T18:00:00.000Z',
    actorUserId: 'admin-1',
    entityType: 'edition',
    entityId: 'ssc21',
    payload: { from: 'planning', to: 'confirmations' },
  },
  {
    id: 'e2',
    editionId: 'ssc21',
    type: 'edition.state_changed',
    occurredAt: '2026-09-10T19:00:00.000Z',
    actorUserId: 'admin-1',
    entityType: 'edition',
    entityId: 'ssc21',
    payload: { from: 'confirmations', to: 'submissions' },
  },
];

describe('timeline replay', () => {
  it('reconstructs the edition state at a chosen point in time', () => {
    expect(
      reconstructEditionState('ssc21', 'planning', stateEvents, '2026-09-10T18:30:00.000Z').state,
    ).toBe('confirmations');
    expect(
      reconstructEditionState('ssc21', 'planning', stateEvents, '2026-09-10T19:30:00.000Z').state,
    ).toBe('submissions');
  });

  it('builds cumulative result replay points from standardized award payloads', () => {
    const events: ContestEvent[] = [
      {
        id: 'vote-1',
        editionId: 'ssc21',
        type: 'jury.ballot_submitted',
        occurredAt: '2026-09-10T18:00:00.000Z',
        actorUserId: 'juror-1',
        entityType: 'ballot',
        entityId: 'b1',
        payload: { awards: [{ countryId: 'oland', points: 12 }, { countryId: 'vendia', points: 10 }] },
      },
      {
        id: 'vote-2',
        editionId: 'ssc21',
        type: 'televote.ballot_submitted',
        occurredAt: '2026-09-10T19:00:00.000Z',
        actorUserId: 'fan-1',
        entityType: 'ballot',
        entityId: 'b2',
        payload: { awards: [{ countryId: 'oland', points: 7 }] },
      },
    ];

    expect(buildScoreReplay(events)).toEqual([
      { eventId: 'vote-1', occurredAt: '2026-09-10T18:00:00.000Z', countryId: 'oland', delta: 12, total: 12 },
      { eventId: 'vote-1', occurredAt: '2026-09-10T18:00:00.000Z', countryId: 'vendia', delta: 10, total: 10 },
      { eventId: 'vote-2', occurredAt: '2026-09-10T19:00:00.000Z', countryId: 'oland', delta: 7, total: 19 },
    ]);
  });
});
