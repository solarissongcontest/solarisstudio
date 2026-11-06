/**
 * Only selections still present in the current, server-provided jury roster
 * may count toward a complete ballot. Old local/server drafts can outlive
 * roster changes; duplicate countries must never fill two point slots.
 */
export function normalizeJuryDraftSelections(
  value: unknown,
  eligibleCountryIds: ReadonlySet<string>,
  pointsCount: number,
): Array<string | null> {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return Array.from({ length: pointsCount }, (_, index) => {
    const countryId: unknown = input[index];
    if (
      typeof countryId !== "string" ||
      !eligibleCountryIds.has(countryId) ||
      seen.has(countryId)
    ) {
      return null;
    }
    seen.add(countryId);
    return countryId;
  });
}

/**
 * A restored local ballot is user work, not a disposable cache. If it differs
 * from the authoritative server draft, ask the voter which version to keep.
 * A clean first visit may hydrate from the server without a conflict prompt.
 */
export function mustReviewLoadedJuryDraft(
  currentLocal: readonly (string | null)[],
  incomingServer: readonly (string | null)[],
  hasUnsyncedLocalWork: boolean,
): boolean {
  return hasUnsyncedLocalWork && (
    currentLocal.length !== incomingServer.length ||
    currentLocal.some((value, index) => value !== incomingServer[index])
  );
}
