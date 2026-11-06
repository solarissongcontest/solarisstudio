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
 * An immutable-looking cursor snapshot must never silently replace a response
 * already presented from an earlier page. Duplicate IDs across pages can hide
 * inconsistent ordering or changed review evidence even if a state-version
 * token and total count happen to remain equal.
 *
 * Validate before appending. Do not make "last page wins" a review authority.
 */
export function assertOrganizerResponsePageDisjoint(
  existing: readonly { id: string }[],
  incoming: readonly { id: string }[],
): void {
  const seen = new Set(existing.map((row) => row.id));
  for (const row of incoming) {
    if (seen.has(row.id)) {
      throw Object.assign(
        new Error("Confirmation response pagination repeated an earlier response. Reload the current edition before reviewing."),
        { status: 409 },
      );
    }
    seen.add(row.id);
  }
}

/**
 * A final page is only final when every canonical response is accounted for.
 * Otherwise the Organizer might mistake a truncated queue for a ready edition.
 * Intermediate pages must not exceed the server's declared total either.
 */
export function assertOrganizerResponsePageCoverage(
  alreadyLoaded: number,
  incoming: number,
  totalCount: number,
  hasMore: boolean,
): void {
  if (![alreadyLoaded, incoming, totalCount].every((count) =>
    Number.isSafeInteger(count) && count >= 0)) {
    throw Object.assign(
      new Error("Confirmation pagination returned invalid response counts. Reload the current edition."),
      { status: 409 },
    );
  }
  const loaded = alreadyLoaded + incoming;
  if (loaded > totalCount || (hasMore ? incoming === 0 || loaded >= totalCount : loaded !== totalCount)) {
    throw Object.assign(
      new Error("Confirmation pagination does not match its canonical response count. Reload the current edition before reviewing."),
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
  if (source && /[\u0000-\u001f\u007f]/.test(source)) return null;
  const value = source?.trim();
  if (!value) return null;
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

/**
 * Legacy Next-in-Line projection is a separate, on-demand queue. The Organizer
 * must fail closed if it returns another edition's response or a malformed
 * card; silently discarding foreign rows would hide a read-authority failure.
 * This presentation guard never substitutes server-side authorization.
 */
export type OrganizerNextInLineRowEvidence = {
  id?: unknown;
  edition_id?: unknown;
  country?: unknown;
  participating?: unknown;
  entry_unknown?: unknown;
  selection_type?: unknown;
  edition?: { id?: unknown } | null;
};

export function assertOrganizerNextInLineRowsInScope<
  T extends OrganizerNextInLineRowEvidence
>(rows: readonly T[], editionId: string): T[] {
  if (!editionId) throw new Error("Select the exact Organizer edition before loading Next in Line.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id.trim() ||
        typeof row.country !== "string" || !row.country.trim() ||
        typeof row.participating !== "boolean" ||
        typeof row.entry_unknown !== "boolean" ||
        typeof row.selection_type !== "string") {
      throw new Error("Next in Line returned malformed response data. Reload the current edition.");
    }
    if (row.edition_id !== editionId || (row.edition && row.edition.id !== editionId)) {
      throw new Error("Next in Line returned response data outside the selected Organizer edition.");
    }
    if (seen.has(row.id)) {
      throw new Error("Next in Line returned duplicate response identities. Reload the current edition.");
    }
    seen.add(row.id);
  }
  return [...rows];
}

/**
 * The server projection must already enforce exact Organizer edition scope.
 * This second boundary rejects malformed/foreign records instead of merging
 * or silently hiding them. It is not an RLS or capability substitute.
 */
export type OrganizerResponseScopeEvidence = {
  id?: unknown;
  editions?: { id?: unknown } | null;
  submission_rounds?: { edition_id?: unknown } | null;
};

export function assertOrganizerResponseRowsInEdition<T extends OrganizerResponseScopeEvidence>(
  rows: readonly T[],
  editionId: string,
): T[] {
  if (!editionId) throw new Error("Select an Organizer edition before loading Confirmation responses.");
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id.trim()) {
      throw new Error("Confirmation response projection returned an invalid response identity.");
    }
    if (row.editions?.id !== editionId ||
        (row.submission_rounds && row.submission_rounds.edition_id !== editionId)) {
      throw new Error("Confirmation response projection returned data outside the selected edition.");
    }
    if (seen.has(row.id)) {
      throw new Error("Confirmation response projection returned duplicate response identities.");
    }
    seen.add(row.id);
  }
  return [...rows];
}
