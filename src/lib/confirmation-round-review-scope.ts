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


/**
 * Validate the authoritative receipt before clearing a reviewed Organizer
 * operation or announcing success. A successful HTTP response alone is not a
 * trustworthy acknowledgement for an R2/R3 change, and an unexpected receipt
 * leaves the operation outcome uncertain until the exact edition is refreshed.
 */
export type ConfirmationRoundReceiptRequest = Readonly<{
  roundId: string | null;
  changeKind: string;
  operationId: string;
  expectedVersion: number;
}>;

export function assertConfirmationRoundReceiptMatchesRequest(
  request: ConfirmationRoundReceiptRequest,
  receipt: unknown,
): void {
  const value = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    ? receipt as Record<string, unknown>
    : null;

  const roundMatches = request.roundId === null
    ? typeof value?.roundId === "string" && value.roundId.trim().length > 0
    : value?.roundId === request.roundId;

  if (!value ||
      value.ok !== true ||
      value.changeKind !== request.changeKind ||
      value.operationId !== request.operationId ||
      value.riskClass !== (request.changeKind === "delete" ? "R3" : "R2") ||
      !roundMatches ||
      !Number.isSafeInteger(request.expectedVersion) ||
      value.previousVersion !== request.expectedVersion ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < request.expectedVersion ||
      typeof value.affectedResponses !== "number" ||
      !Number.isSafeInteger(value.affectedResponses) ||
      value.affectedResponses < 0) {
    throw Object.assign(
      new Error(
        "Round operation returned an unexpected receipt. Its outcome may be uncertain; refresh the exact Organizer edition before retrying.",
      ),
      { status: 409 },
    );
  }
}
