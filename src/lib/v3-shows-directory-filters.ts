/**
 * Pure presentation filtering for already publication-filtered Show discovery.
 * Does not infer broadcast state or access unpublished Show data.
 */
export function matchesShowDirectorySearch(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.filter(Boolean).join(" ").toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Revoked or superseded edition/type facet IDs must not strand Show browsing. */
export function resolveShowDirectoryFacet(
  requested: string,
  permitted: readonly string[],
): string {
  return requested === "all" || permitted.includes(requested) ? requested : "all";
}
