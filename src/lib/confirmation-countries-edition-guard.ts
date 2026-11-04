/**
 * A delegated country list is private Organizer data. Bind the entire
 * projection batch to the exact selected edition and the load generation;
 * A → B → A must not resurrect the earlier A read or its copy actions.
 */
export type ConfirmationCountriesRequest = Readonly<{
  editionId: string;
  generation: number;
}>;

export function isCurrentConfirmationCountriesRequest(
  request: ConfirmationCountriesRequest,
  current: ConfirmationCountriesRequest,
): boolean {
  return Boolean(request.editionId) &&
    request.editionId === current.editionId &&
    Number.isSafeInteger(request.generation) &&
    request.generation >= 0 &&
    request.generation === current.generation;
}

export type ConfirmationCountryScopedRow = {
  editions: { id: string } | null;
  submission_rounds: { edition_id: string } | null;
};

/** Refuse to render or export a partial batch containing a foreign round. */
export function isConfirmationCountryBatchInEdition(
  rows: readonly ConfirmationCountryScopedRow[],
  editionId: string,
): boolean {
  return Boolean(editionId) && rows.every(
    (row) =>
      row.editions?.id === editionId &&
      (row.submission_rounds === null || row.submission_rounds.edition_id === editionId),
  );
}

/**
 * The latest response is the authoritative current country intent for this
 * edition. Looking back for ANY participating response resurrects withdrawals
 * and can corrupt copied participation/status lists.
 * Callers must sort newest-first before using this selector.
 */
export function latestParticipatingConfirmation<T extends { participating: boolean }>(
  latestFirstRows: readonly T[],
): T | null {
  const latest = latestFirstRows[0];
  return latest?.participating ? latest : null;
}

/**
 * Organizer readiness must be derived from accepted, nonremoved candidates.
 * A stale winner ID, missing winner, or unreviewed entry is not a ready
 * National Final, even if a previous round had selected a winner.
 */
export type ConfirmationNationalFinalTriage = "review" | "issue" | "ready" | "neutral";

export function deriveConfirmationNationalFinalTriage(
  entries: readonly { id: string; review_status: string | null; removed?: boolean | null }[],
  winningEntryId: string | null,
  entriesUnknown: boolean,
): ConfirmationNationalFinalTriage {
  const active = entries.filter((entry) => !entry.removed && entry.review_status !== "removed");
  if (entriesUnknown || active.length === 0) return "neutral";
  if (active.some((entry) => entry.review_status === "declined")) return "issue";
  if (active.some((entry) => entry.review_status !== "accepted")) return "review";
  if (!winningEntryId) return "neutral";
  return active.some((entry) => entry.id === winningEntryId) ? "ready" : "issue";
}
