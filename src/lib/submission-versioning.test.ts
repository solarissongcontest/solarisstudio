import { describe, expect, it } from 'vitest';
import {
  canEditSubmission,
  diffSubmissionSnapshots,
  grantSubmissionEditException,
  nextSubmissionVersion,
  type SubmissionLock,
} from './submission-versioning';

describe('submission versioning', () => {
  it('creates sequential immutable-style snapshots and reports changed fields', () => {
    const first = nextSubmissionVersion({
      submissionId: 'entry-1',
      previous: null,
      snapshot: { artist: 'A', song: 'Song' },
      changedBy: 'hod-1',
      changedAt: '2026-09-10T18:00:00.000Z',
    });
    const second = nextSubmissionVersion({
      submissionId: 'entry-1',
      previous: first,
      snapshot: { artist: 'Artist A', song: 'Song', artwork: 'cover.png' },
      changedBy: 'hod-1',
      changedAt: '2026-09-10T19:00:00.000Z',
    });

    expect(second.version).toBe(2);
    expect(diffSubmissionSnapshots(first.snapshot, second.snapshot).map((change) => change.field)).toEqual([
      'artist',
      'artwork',
    ]);
  });

  it('keeps locked submissions closed unless a live exception exists', () => {
    const lock: SubmissionLock = {
      locked: true,
      lockedAt: '2026-09-10T18:00:00.000Z',
      lockedBy: 'admin-1',
      exceptionUntil: null,
      exceptionReason: null,
      exceptionGrantedBy: null,
    };

    expect(canEditSubmission(lock, new Date('2026-09-10T19:00:00.000Z'))).toBe(false);

    const excepted = grantSubmissionEditException({
      lock,
      until: '2026-09-10T20:00:00.000Z',
      reason: 'Correct broadcaster-supplied artwork.',
      grantedBy: 'admin-2',
      now: new Date('2026-09-10T19:00:00.000Z'),
    });

    expect(canEditSubmission(excepted, new Date('2026-09-10T19:30:00.000Z'))).toBe(true);
    expect(canEditSubmission(excepted, new Date('2026-09-10T20:00:00.000Z'))).toBe(false);
  });
});
