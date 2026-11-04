/**
 * A page response belongs to the same Organizer request epoch only when
 * both the selected edition and the generation still match.
 *
 * Checking edition alone is insufficient: A → B → A must not admit a
 * response produced by the first A session.
 */
export type ConfirmationResponsePageRequest = Readonly<{
  editionId: string;
  generation: number;
}>;

export function isCurrentConfirmationResponsePage(
  request: ConfirmationResponsePageRequest,
  current: ConfirmationResponsePageRequest,
): boolean {
  return Boolean(request.editionId) &&
    Number.isSafeInteger(request.generation) &&
    request.generation >= 0 &&
    request.editionId === current.editionId &&
    request.generation === current.generation;
}

/**
 * A stored winner ID is not proof of an accepted National Final result:
 * the chosen candidate must still be active and accepted. Used for the
 * Organizer response queue's status and human-readable summary.
 */
export function isActiveAcceptedConfirmationWinner(
  entries: readonly { id: string; review_status: string | null; removed?: boolean | null }[],
  winningEntryId: string | null | undefined,
): boolean {
  return typeof winningEntryId === "string" &&
    winningEntryId.length > 0 &&
    entries.some((entry) =>
      entry.id === winningEntryId &&
      !entry.removed &&
      entry.review_status === "accepted",
    );
}
