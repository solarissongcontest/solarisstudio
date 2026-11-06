/**
 * A settled review is historical evidence if its attempted immutable Entry
 * version differs from the version currently displayed in Organizer Review.
 * This helper only controls presentation; the canonical RPC and receipt are
 * the sole authority for applying decisions.
 */
export function isOrganizerEntryReviewResultForDisplayedVersion(
  attemptedVersion: string | null | undefined,
  displayedVersion: string | null | undefined,
): boolean {
  const normalized = (version: string | null | undefined) =>
    typeof version === "string" && version.trim() ? version.trim() : null;
  const attempted = normalized(attemptedVersion);
  const displayed = normalized(displayedVersion);
  // Two absent immutable IDs do NOT prove the settled review belongs to the
  // latest Entry. A canonical receipt proves the operation, not version parity.
  return Boolean(attempted && displayed && attempted === displayed);
}
