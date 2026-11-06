/**
 * Organizer response queue can be paged, but two snapshots from different
 * canonical state versions must never be assembled as one visible result set.
 */
export function assertOrganizerResponsePageContinuity(
  baseline: { stateVersion: string | null; totalCount: number },
  incoming: { stateVersion: string | null; totalCount: number },
): void {
  if (!baseline.stateVersion || !incoming.stateVersion ||
      baseline.stateVersion !== incoming.stateVersion) {
    throw Object.assign(
      new Error("Confirmation responses changed during pagination. Reload the current edition before continuing."),
      { status: 409 },
    );
  }
  if (baseline.totalCount !== incoming.totalCount) {
    throw Object.assign(
      new Error("Confirmation response count changed during pagination. Reload the current edition before continuing."),
      { status: 409 },
    );
  }
}

/**
 * Next-in-Line song URLs are participant supplied. Reject script/data/file,
 * malformed, relative, credentialed and control-character URLs. This is a
 * display-only guard, not authorization to fetch private media.
 */
export function safeOrganizerResponseSongUrl(source: string | null | undefined): string | null {
  const value = source?.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !!url.hostname && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
