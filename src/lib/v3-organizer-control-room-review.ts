/**
 * The Control Room may reuse a mounted review sheet while Organizer context
 * switches editions. Matching runtime versions or state names do not establish
 * identity: a reviewed command belongs to the exact edition it was opened for.
 */
export function controlRoomReviewMatchesEdition(
  reviewedEditionId: string,
  selectedEditionId: string | null,
  snapshotEditionId: string | null,
): boolean {
  return Boolean(
    selectedEditionId &&
      reviewedEditionId === selectedEditionId &&
      snapshotEditionId === selectedEditionId,
  );
}
