/**
 * Viewer-local consent to reveal official, potentially spoiler-sensitive
 * analysis is scoped to the selected published Show and authenticated viewer.
 *
 * This only controls the presentation. Publication and permission checks remain
 * server-authoritative, and the shared Results preference policy is resolved by
 * resolveV3ResultsSpoilerProtection before this function is called.
 */
export type V3ResultsAnalysisRevealInput = {
  hideSpoilers: boolean;
  selectedShowId: string | null;
  viewerId: string | null;
  revealedResultKey: string | null;
};

export function resolveV3ResultsAnalysisReveal(
  input: V3ResultsAnalysisRevealInput,
): { protected: boolean; revealKey: string | null } {
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
