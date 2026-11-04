/**
 * The response-detail RPC is keyed by a submission ID. Organizer navigation
 * must additionally bind the result to the selected edition before exposing
 * private review, technical, recovery or privileged mutation controls.
 *
 * This client guard supplements server-side confirmation.read and RLS.
 */
export type ScopedConfirmationDetail = {
  id?: string | null;
  edition?: { id?: string | null } | null;
};

export function isConfirmationDetailInOrganizerScope<T extends ScopedConfirmationDetail>(
  detail: T | null | undefined,
  expectedSubmissionId: string,
  organizerEditionId: string,
): detail is T {
  return Boolean(
    expectedSubmissionId &&
    organizerEditionId &&
    detail?.id === expectedSubmissionId &&
    detail?.edition?.id === organizerEditionId,
  );
}

/** A pending Entry review is a specific edition, submission, candidate and
 * operation. The same candidate ID in a different context is not permission
 * to resume an earlier privileged mutation.
 */
export type PendingConfirmationEntryReviewScope = Readonly<{
  operationId: string;
  entryId: string;
  submissionId: string;
  editionId: string | null;
  targetType: "internal" | "national_final";
}>;

export function isPendingConfirmationEntryReviewInScope(
  pending: PendingConfirmationEntryReviewScope,
  current: Omit<PendingConfirmationEntryReviewScope, "operationId">,
): boolean {
  return Boolean(
    pending.operationId &&
    current.editionId &&
    pending.entryId &&
    pending.submissionId &&
    pending.operationId.trim() &&
    pending.entryId === current.entryId &&
    pending.submissionId === current.submissionId &&
    pending.editionId === current.editionId &&
    pending.targetType === current.targetType,
  );
}

/** A transport-level success or a receipt for another operation never settles
 * the locally unresolved operation. Only the matching authoritative receipt does.
 */
export function isSuccessfulConfirmationEntryReviewReceipt(
  receipt: { status?: string; operationId?: string | null } | null | undefined,
  operationId: string,
): boolean {
  return Boolean(operationId && receipt?.operationId === operationId && receipt.status === "succeeded");
}
