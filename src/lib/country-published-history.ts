/**
 * Browser Country History filters only the already-public canonical entry
 * projection. Never query participants/ballots or infer unpublished entries.
 */
export type CountryHistoryOutcome = "all" | "finalist" | "eliminated";

export type CountryHistoryFilter = {
  search: string;
  outcome: CountryHistoryOutcome;
};

type CountryHistoryEntry = {
  edition_id: string;
  artist?: string | null;
  song?: string | null;
};

export function filterPublishedCountryHistory<T extends CountryHistoryEntry>(
  entries: readonly T[],
  filters: CountryHistoryFilter,
  editionSearchTerms: (editionId: string) => readonly (string | null | undefined)[],
  qualification: (editionId: string) => string | null,
): T[] {
  const query = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    const status = qualification(entry.edition_id);
    if (filters.outcome === "finalist" && status !== "q" && status !== "aq" && status !== "wildcard") return false;
    if (filters.outcome === "eliminated" && status !== "nq") return false;
    if (!query) return true;
    const terms = [...editionSearchTerms(entry.edition_id), entry.artist, entry.song]
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return terms.join(" ").toLowerCase().includes(query);
  });
}
