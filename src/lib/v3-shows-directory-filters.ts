import { matchesPublicDirectorySearch, resolvePublicDirectoryFacet } from "./v3-public-directory-search";

/**
 * Pure presentation filtering for already publication-filtered Show discovery.
 * Does not infer broadcast state or access unpublished Show data.
 */
export function matchesShowDirectorySearch(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  return matchesPublicDirectorySearch(query, fields);
}

/** Revoked or superseded edition/type facet IDs must not strand Show browsing. */
export function resolveShowDirectoryFacet(
  requested: string,
  permitted: readonly string[],
): string {
  return resolvePublicDirectoryFacet(requested, permitted);
}
