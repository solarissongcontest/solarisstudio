/**
 * Context lock for an Organizer Confirmation round impact review.
 *
 * Edition alone is insufficient: after A → B → A the original A preview
 * is no longer valid even if its RPC returned a still-current state version.
 */
export type ConfirmationRoundReviewRequest = Readonly<{
  editionId: string;
  epoch: number;
}>;

export type ConfirmationRoundReviewContext = ConfirmationRoundReviewRequest & Readonly<{
  organizerEditionId: string;
}>;

export function isCurrentConfirmationRoundReview(
  request: ConfirmationRoundReviewRequest,
  current: ConfirmationRoundReviewContext,
  previewEditionId?: string,
): boolean {
  return Boolean(request.editionId) &&
    Number.isSafeInteger(request.epoch) &&
    request.epoch >= 0 &&
    request.editionId === current.editionId &&
    request.editionId === current.organizerEditionId &&
    request.epoch === current.epoch &&
    (previewEditionId === undefined || previewEditionId === request.editionId);
}
