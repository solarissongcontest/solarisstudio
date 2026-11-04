import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareEditionTransition } from './edition-transition-policy';

afterEach(() => vi.unstubAllGlobals());

describe('edition transition policy', () => {
  it('generates a cryptographic UUID for a new edition event in older browsers', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = i;
        return bytes;
      },
    });
    const result = prepareEditionTransition({
      editionId: 'ssc21',
      from: 'planning',
      to: 'confirmations',
      actorUserId: 'admin-1',
    });
    expect(result.event.id).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('refuses to invent edition event identities without cryptographic randomness', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => prepareEditionTransition({
      editionId: 'ssc21',
      from: 'planning',
      to: 'confirmations',
      actorUserId: 'admin-1',
    })).toThrow(/cryptographically secure edition transition event ID/i);

    // Existing caller-provided event identities remain valid: no new randomness
    // is needed to replay a previously identified event.
    expect(prepareEditionTransition({
      editionId: 'ssc21',
      from: 'planning',
      to: 'confirmations',
      actorUserId: 'admin-1',
      eventId: 'existing-event-id',
    }).event.id).toBe('existing-event-id');
  });

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
