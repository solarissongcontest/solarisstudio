/**
 * Result Lab displays published ranking and simulated winner details. Its
 * presentation must not reveal a different show or viewer just because an
 * earlier result was deliberately revealed in this browser session.
 *
 * Spoiler preference resolution lives in v3-results.ts. This helper only
 * scopes the local reveal to one viewer and one selected official show.
 */
export function resolveV3ResultLabSpoilerGate(input: {
  hideSpoilers: boolean;
  selectedShowId: string | null;
  viewerId: string | null;
  revealedResultKey: string | null;
}): { protected: boolean; revealKey: string | null } {
  const revealKey = input.selectedShowId
    ? JSON.stringify([input.viewerId ?? "anonymous", input.selectedShowId])
    : null;

  return {
    protected: Boolean(
      input.hideSpoilers &&
        revealKey &&
        input.revealedResultKey !== revealKey,
    ),
    revealKey,
  };
}
