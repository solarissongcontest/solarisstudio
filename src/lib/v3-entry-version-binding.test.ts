import { describe, expect, it } from 'vitest';

import {
  adaptLegacyEntrySnapshot,
  canPublishV3EntryVersion,
  createV3EntryReview,
  createV3SubmittedEntryVersion,
  evaluateV3EntryReview,
  restoreV3SubmittedEntryVersion,
  type V3EntryReview,
} from './v3-entry-version-binding';

const v3 = createV3SubmittedEntryVersion({
  entryId: 'entry-1',
  editionId: 'edition-22',
  delegationId: 'country-oland',
  versionId: 'entry-version-3',
  versionNumber: 3,
  contentHash: 'sha256:version-3',
  submittedAt: '2026-10-12T03:00:00.000Z',
  submittedBy: 'user-hod',
});

describe('V3 immutable entry version binding', () => {
  it('binds an approval to the exact submitted immutable version', () => {
    const review = createV3EntryReview(v3, {
      reviewId: 'review-1',
      decision: 'approved',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
    });

    expect(evaluateV3EntryReview(v3, review).state).toBe('approved_current');
    expect(canPublishV3EntryVersion(v3, review)).toBe(true);
    expect(review.submittedVersionId).toBe('entry-version-3');
    expect(review.submittedVersionNumber).toBe(3);
    expect(review.submittedContentHash).toBe('sha256:version-3');
  });

  it('does not let an approval for version 3 silently approve version 4', () => {
    const review = createV3EntryReview(v3, {
      reviewId: 'review-1',
      decision: 'approved',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
    });
    const v4 = createV3SubmittedEntryVersion({
      ...v3,
      versionId: 'entry-version-4',
      versionNumber: 4,
      contentHash: 'sha256:version-4',
      submittedAt: '2026-10-12T03:20:00.000Z',
    });

    expect(evaluateV3EntryReview(v4, review).state).toBe('review_superseded');
    expect(canPublishV3EntryVersion(v4, review)).toBe(false);
  });

  it('still treats a new version identity as unapproved even when the payload hash matches', () => {
    const review = createV3EntryReview(v3, {
      reviewId: 'review-1',
      decision: 'approved',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
    });
    const v4SamePayload = createV3SubmittedEntryVersion({
      ...v3,
      versionId: 'entry-version-4',
      versionNumber: 4,
      submittedAt: '2026-10-12T03:20:00.000Z',
    });

    expect(evaluateV3EntryReview(v4SamePayload, review).state).toBe('review_superseded');
  });

  it('restores historical content by creating a new version instead of mutating history', () => {
    const restored = restoreV3SubmittedEntryVersion(v3, {
      newVersionId: 'entry-version-8',
      newVersionNumber: 8,
      restoredAt: '2026-10-12T04:00:00.000Z',
      restoredBy: 'user-hod',
    });

    expect(restored.versionId).toBe('entry-version-8');
    expect(restored.versionNumber).toBe(8);
    expect(restored.contentHash).toBe(v3.contentHash);
    expect(restored.submittedAt).toBe('2026-10-12T04:00:00.000Z');
    expect(v3.versionId).toBe('entry-version-3');
    expect(v3.versionNumber).toBe(3);
  });

  it('does not carry an old approval onto a restored version', () => {
    const review = createV3EntryReview(v3, {
      reviewId: 'review-1',
      decision: 'approved',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
    });
    const restored = restoreV3SubmittedEntryVersion(v3, {
      newVersionId: 'entry-version-8',
      newVersionNumber: 8,
      restoredAt: '2026-10-12T04:00:00.000Z',
      restoredBy: 'user-hod',
    });

    expect(evaluateV3EntryReview(restored, review).state).toBe('review_superseded');
    expect(canPublishV3EntryVersion(restored, review)).toBe(false);
  });

  it('fails closed when a review is scoped to another entry or delegation', () => {
    const forged: V3EntryReview = {
      entryId: 'entry-other',
      editionId: v3.editionId,
      delegationId: v3.delegationId,
      reviewId: 'review-forged',
      submittedVersionId: v3.versionId,
      submittedVersionNumber: v3.versionNumber,
      submittedContentHash: v3.contentHash,
      decision: 'approved',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
      reason: null,
    };

    expect(evaluateV3EntryReview(v3, forged)).toEqual({
      state: 'integrity_error',
      reason: 'Review scope does not match the entry version.',
    });
  });

  it('preserves changes-requested and rejected as explicit current-version states', () => {
    const changes = createV3EntryReview(v3, {
      reviewId: 'review-changes',
      decision: 'changes_requested',
      reviewedAt: '2026-10-12T03:15:00.000Z',
      reviewedBy: 'organizer-1',
      reason: 'Replace the listening link.',
    });
    const rejected = createV3EntryReview(v3, {
      reviewId: 'review-rejected',
      decision: 'rejected',
      reviewedAt: '2026-10-12T03:16:00.000Z',
      reviewedBy: 'organizer-1',
      reason: 'Entry is ineligible.',
    });

    expect(evaluateV3EntryReview(v3, changes).state).toBe('changes_requested_current');
    expect(evaluateV3EntryReview(v3, rejected).state).toBe('rejected_current');
  });

  it('does not pretend an existing unversioned entry row satisfies the V3 cutover gate', () => {
    const evidence = adaptLegacyEntrySnapshot({
      entryId: 'entry-legacy',
      editionId: 'edition-22',
      delegationId: 'country-oland',
      updatedAt: '2026-10-12T03:00:00.000Z',
      status: 'confirmed',
    });

    expect(evidence.authority).toBe('legacy_unversioned');
    expect(evidence.legacyStatus).toBe('confirmed');
    expect(evidence.canBindV3Review).toBe(false);
    expect(evidence.canSatisfyImmutableVersionGate).toBe(false);
  });

  it('rejects restoration that reuses the historical version identity or number', () => {
    expect(() =>
      restoreV3SubmittedEntryVersion(v3, {
        newVersionId: v3.versionId,
        newVersionNumber: 4,
        restoredAt: '2026-10-12T04:00:00.000Z',
        restoredBy: 'user-hod',
      }),
    ).toThrow(/new immutable version identity/);

    expect(() =>
      restoreV3SubmittedEntryVersion(v3, {
        newVersionId: 'entry-version-new',
        newVersionNumber: 3,
        restoredAt: '2026-10-12T04:00:00.000Z',
        restoredBy: 'user-hod',
      }),
    ).toThrow(/advance the version number/);
  });
});
