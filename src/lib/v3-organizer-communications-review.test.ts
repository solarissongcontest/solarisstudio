import { describe, expect, it } from 'vitest';

import type { OperationalNotice } from './official-communications';
import type { SaveStudio2NoticeInput } from './studio2-communications';
import {
  assertCommunicationPublicationReviewCurrent,
  prepareCommunicationPublicationReview,
} from './v3-organizer-communications-review';

const editionId = 'edition-22';

function input(): SaveStudio2NoticeInput {
  return {
    editionId,
    noticeType: 'official_notice',
    title: 'Jury deadline',
    body: 'Jury voting closes at 20:00.',
    severity: 'action_required',
    displaySurfaces: ['delegation_inbox', 'mysolaris_home'],
    audience: 'specific_countries',
    audienceGroup: null,
    countryIds: ['oland', 'vendia'],
    acknowledgementRequired: true,
  };
}

function notice(overrides: Partial<OperationalNotice> = {}): OperationalNotice {
  return {
    id: 'notice-1',
    editionId,
    noticeType: 'official_notice',
    title: 'Jury deadline',
    body: 'Jury voting closes at 20:00.',
    severity: 'action_required',
    audience: 'specific_countries',
    audienceGroup: null,
    countryIds: ['oland', 'vendia'],
    acknowledgementRequired: true,
    displaySurfaces: ['delegation_inbox', 'mysolaris_home'],
    state: 'draft',
    scheduledAt: null,
    sentAt: null,
    cancelledAt: null,
    archivedAt: null,
    supersededById: null,
    revision: 7,
    ...overrides,
  };
}

describe('Organizer Communications publication review', () => {
  it('freezes arrays and the exact existing notice revision instead of retaining live composer references', () => {
    const composer = input();
    const review = prepareCommunicationPublicationReview({
      kind: 'publish',
      editionId,
      input: composer,
      existingNotice: notice(),
    });

    composer.title = 'Changed after review';
    composer.countryIds.push('hanvor');
    composer.displaySurfaces.splice(0, 1);

    expect(review.noticeId).toBe('notice-1');
    expect(review.expectedRevision).toBe(7);
    expect(review.expectedState).toBe('draft');
    expect(review.input.title).toBe('Jury deadline');
    expect(review.input.countryIds).toEqual(['oland', 'vendia']);
    expect(review.input.displaySurfaces).toEqual(['delegation_inbox', 'mysolaris_home']);
  });

  it('normalizes and freezes the exact scheduled publication instant', () => {
    const review = prepareCommunicationPublicationReview({
      kind: 'schedule',
      editionId,
      input: input(),
      scheduledAt: '2026-10-20T20:15:00+03:00',
      existingNotice: notice(),
    });

    expect(review.scheduledAtIso).toBe('2026-10-20T17:15:00.000Z');
  });

  it('fails closed when review scope does not match the selected Organizer edition', () => {
    expect(() => prepareCommunicationPublicationReview({
      kind: 'publish',
      editionId: 'edition-23',
      input: input(),
    })).toThrow(/exact selected Organizer edition/i);
  });

  it('rejects stale revisions and lifecycle state changes before apply', () => {
    const review = prepareCommunicationPublicationReview({
      kind: 'publish',
      editionId,
      input: input(),
      existingNotice: notice(),
    });

    expect(() => assertCommunicationPublicationReviewCurrent(
      review,
      editionId,
      notice({ revision: 8 }),
    )).toThrow(/changed after this review/i);

    expect(() => assertCommunicationPublicationReviewCurrent(
      review,
      editionId,
      notice({ state: 'scheduled' }),
    )).toThrow(/changed after this review/i);
  });

  it('rejects edition drift and missing reviewed notices', () => {
    const review = prepareCommunicationPublicationReview({
      kind: 'publish',
      editionId,
      input: input(),
      existingNotice: notice(),
    });

    expect(() => assertCommunicationPublicationReviewCurrent(review, 'edition-23', notice()))
      .toThrow(/edition changed/i);
    expect(() => assertCommunicationPublicationReviewCurrent(review, editionId, null))
      .toThrow(/changed or disappeared/i);
  });

  it('allows a new reviewed draft to proceed without inventing an existing-notice revision', () => {
    const review = prepareCommunicationPublicationReview({
      kind: 'publish',
      editionId,
      input: input(),
    });

    expect(review.noticeId).toBeNull();
    expect(review.expectedRevision).toBeNull();
    expect(() => assertCommunicationPublicationReviewCurrent(review, editionId, null)).not.toThrow();
  });
});
