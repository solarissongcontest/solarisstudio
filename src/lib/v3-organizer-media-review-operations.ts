import type { Studio2MediaReviewRequest } from '@/lib/studio2-media-assets';
import {
  createMediaReviewOperationIdentity,
  reviewStudio2MediaAssetsV3,
  type Studio2MediaReviewReceipt,
} from '@/lib/studio2-media-review-command';

export type OrganizerMediaReviewOperation = {
  editionId: string;
  reviews: Studio2MediaReviewRequest[];
  reason: string;
  operationId: string;
  idempotencyKey: string;
};

function requireEditionId(value: string): string {
  const editionId = value.trim();
  if (!editionId) throw new Error('Choose an Organizer edition before reviewing media.');
  return editionId;
}

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 5) {
    throw new Error('A Media Review audit reason of at least 5 characters is required.');
  }
  return reason;
}

function cloneReviews(reviews: readonly Studio2MediaReviewRequest[]): Studio2MediaReviewRequest[] {
  if (!reviews.length) throw new Error('Select at least one media asset.');

  const seen = new Set<string>();
  return reviews.map((review) => {
    const assetKey = review.assetKey.trim();
    const sourceFingerprint = review.sourceFingerprint.trim();
    if (!assetKey || !sourceFingerprint) {
      throw new Error('Only exact uploaded media sources can enter Media Review.');
    }
    if (seen.has(assetKey)) {
      throw new Error('The same media asset cannot appear twice in one reviewed operation.');
    }
    seen.add(assetKey);
    return {
      ...review,
      assetKey,
      sourceFingerprint,
    };
  });
}

function sameNullable(left: string | null, right: string | null): boolean {
  return left === right;
}

function sameReview(left: Studio2MediaReviewRequest, right: Studio2MediaReviewRequest): boolean {
  return left.assetKey === right.assetKey
    && left.assetType === right.assetType
    && sameNullable(left.countryId, right.countryId)
    && sameNullable(left.entryId, right.entryId)
    && left.sourceFingerprint === right.sourceFingerprint
    && left.decision === right.decision;
}

function assertSameReviewedSet(
  reviewed: readonly Studio2MediaReviewRequest[],
  current: readonly Studio2MediaReviewRequest[],
) {
  if (reviewed.length !== current.length) {
    throw new Error('Media Review selection changed after review. Review the current asset set again.');
  }

  const currentByKey = new Map(current.map((item) => [item.assetKey, item] as const));
  for (const item of reviewed) {
    const live = currentByKey.get(item.assetKey);
    if (!live || !sameReview(item, live)) {
      throw new Error('A media source changed after review. Reload the current media state and review again.');
    }
  }
}

export function prepareOrganizerMediaReviewOperation(input: {
  editionId: string;
  reviews: readonly Studio2MediaReviewRequest[];
  reason: string;
}): OrganizerMediaReviewOperation {
  const identity = createMediaReviewOperationIdentity();
  return {
    editionId: requireEditionId(input.editionId),
    reviews: cloneReviews(input.reviews),
    reason: normalizeReason(input.reason),
    operationId: identity.operationId,
    idempotencyKey: identity.idempotencyKey,
  };
}

export async function commitOrganizerMediaReviewOperation(input: {
  currentEditionId: string;
  review: OrganizerMediaReviewOperation;
  currentReviews: readonly Studio2MediaReviewRequest[];
}): Promise<Studio2MediaReviewReceipt> {
  const currentEditionId = requireEditionId(input.currentEditionId);
  if (currentEditionId !== input.review.editionId) {
    throw new Error('Organizer edition changed after Media Review opened. Review again.');
  }

  const currentReviews = cloneReviews(input.currentReviews);
  assertSameReviewedSet(input.review.reviews, currentReviews);

  const receipt = await reviewStudio2MediaAssetsV3({
    editionId: input.review.editionId,
    reviews: input.review.reviews,
    reason: input.review.reason,
    operationId: input.review.operationId,
    idempotencyKey: input.review.idempotencyKey,
  });

  if (
    receipt.operationId !== input.review.operationId
    || receipt.receiptId !== input.review.operationId
    || receipt.editionId !== input.review.editionId
  ) {
    throw new Error('Solaris settled a different Media Review operation than the one reviewed.');
  }

  return receipt;
}
