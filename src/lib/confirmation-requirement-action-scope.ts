/**
 * A requirement mutation may complete the visible review only in the exact
 * Organizer edition selection epoch from which it started. Checking edition
 * identity alone is insufficient: switching A -> B -> A can reuse the same
 * edition ID while the user has already opened a different review.
 *
 * The canonical server RPC owns the mutation. This guard only controls
 * client-side review state, completion toasts and stale error visibility.
 */
export function isCurrentConfirmationRequirementAction(
  requestedEditionId: string | null | undefined,
  currentEditionId: string | null | undefined,
  requestedReviewEpoch: number,
  currentReviewEpoch: number,
): boolean {
  return typeof requestedEditionId === "string" &&
    requestedEditionId.length > 0 &&
    requestedEditionId === currentEditionId &&
    Number.isSafeInteger(requestedReviewEpoch) &&
    requestedReviewEpoch >= 0 &&
    requestedReviewEpoch === currentReviewEpoch;
}
