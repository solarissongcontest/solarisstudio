/** Do not approve a fresh server version the organiser has not seen yet. */
export function assertDisplayedEntryVersion(
  displayedVersionId: string | null | undefined,
  previewVersionId: string | null | undefined,
): void {
  if (!displayedVersionId && !previewVersionId) return; // Legacy server, no V3 claim.
  if (!displayedVersionId || displayedVersionId !== previewVersionId) {
    throw new Error(
      "Entry content changed. Refresh and review the current version before continuing.",
    );
  }
}
