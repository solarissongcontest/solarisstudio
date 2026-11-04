/**
 * Organizer jury-window controls may render "Closed" only after a successful,
 * edition-scoped authoritative read. A missing row in a successful read means
 * the window has not been opened; a failed read does not.
 */
export type JuryWindowReadState = "checking" | "unavailable" | "open" | "closed";

export type JuryWindowRecord = {
  edition_id: string;
  show_id: string;
  status: "open" | "closed";
};

export function resolveJuryWindowReadState({
  editionId,
  showId,
  rows,
  isLoading,
  hasError,
}: {
  editionId: string | null | undefined;
  showId: string | null | undefined;
  rows: readonly JuryWindowRecord[] | undefined;
  isLoading: boolean;
  hasError: boolean;
}): JuryWindowReadState {
  if (!editionId || !showId || hasError) return "unavailable";
  if (isLoading) return "checking";
  if (!rows || rows.some((row) => row.edition_id !== editionId)) return "unavailable";

  const matching = rows.filter((row) => row.show_id === showId);
  if (
    matching.length > 1 ||
    matching.some((row) => row.status !== "open" && row.status !== "closed")
  ) {
    return "unavailable";
  }

  return matching[0]?.status ?? "closed";
}

/** A reviewed R2 operation must never silently cross an Organizer context switch. */
export function isJuryWindowReviewScopeCurrent(
  preview: { editionId: string; showId: string } | null | undefined,
  current: { editionId: string | null | undefined; showId: string | null | undefined },
): boolean {
  return Boolean(
    preview &&
      current.editionId &&
      current.showId &&
      preview.editionId === current.editionId &&
      preview.showId === current.showId,
  );
}

/**
 * A missing show parameter may select the first available show. An explicit
 * invalid/stale show link must never silently target a different show.
 */
export function selectJuryWindowShow<T extends { id: string }>(
  shows: readonly T[],
  requestedShowId: string | null | undefined,
): T | null {
  const explicit = requestedShowId?.trim();
  if (explicit) return shows.find((show) => show.id === explicit) ?? null;
  return shows[0] ?? null;
}
