import { describe, expect, it } from 'vitest';
import { prepareEditionTransition } from './edition-transition-policy';

describe('edition transition policy', () => {
  it('allows a normal transition without extra approval', () => {
    const result = prepareEditionTransition({
      editionId: 'ssc21',
      from: 'planning',
      to: 'confirmations',
      actorUserId: 'admin-1',
      eventId: 'event-1',
      occurredAt: '2026-09-10T18:00:00.000Z',
    });

    expect(result.transition.risk).toBe('normal');
    expect(result.event.type).toBe('edition.state_changed');
    expect(result.event.payload.reason).toBeNull();
  });

  it('requires a reason for elevated rollback transitions', () => {
    expect(() =>
      prepareEditionTransition({
        editionId: 'ssc21',
        from: 'submissions',
        to: 'confirmations',
        actorUserId: 'admin-1',
      }),
    ).toThrow(/reason is required/i);
  });

  it('requires a different second approver for critical transitions', () => {
    expect(() =>
      prepareEditionTransition({
        editionId: 'ssc21',
        from: 'vote_verification',
        to: 'televoting',
        actorUserId: 'admin-1',
        reason: 'Voting outage invalidated the original close.',
      }),
    ).toThrow(/second approver/i);

    expect(() =>
      prepareEditionTransition({
        editionId: 'ssc21',
        from: 'vote_verification',
        to: 'televoting',
        actorUserId: 'admin-1',
        secondApproverUserId: 'admin-1',
        reason: 'Voting outage invalidated the original close.',
      }),
    ).toThrow(/different user/i);

    expect(
      prepareEditionTransition({
        editionId: 'ssc21',
        from: 'vote_verification',
        to: 'televoting',
        actorUserId: 'admin-1',
        secondApproverUserId: 'admin-2',
        reason: 'Voting outage invalidated the original close.',
        eventId: 'event-2',
        occurredAt: '2026-09-10T18:00:00.000Z',
      }).transition.risk,
    ).toBe('critical');
  });
});
