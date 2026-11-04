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

/** Verify the *server* reviewed exactly the command the Organizer requested.
 * Round IDs are null for creation and required to match for all other kinds.
 * Failing closed is safer than applying a different round's valid-looking
 * version number or a stale impact sheet.
 */
export type ConfirmationRoundPreviewIdentity = Readonly<{
  editionId: string;
  roundId: string | null;
  changeKind: string;
}>;

export function assertConfirmationRoundPreviewMatchesRequest(
  request: ConfirmationRoundPreviewIdentity,
  preview: ConfirmationRoundPreviewIdentity & Readonly<{ expectedVersion: number }>,
): void {
  if (!request.editionId ||
      request.editionId !== preview.editionId ||
      request.roundId !== preview.roundId ||
      request.changeKind !== preview.changeKind ||
      !Number.isSafeInteger(preview.expectedVersion) ||
      preview.expectedVersion < 0) {
    throw Object.assign(
      new Error("Confirmation round impact preview does not match the reviewed edition, round, operation, or version. Nothing was applied."),
      { status: 409 },
    );
  }
}
