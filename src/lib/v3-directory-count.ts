/** A single counter vocabulary for published public directory collections.
 * available = items in the chosen collection before filters.
 * matches = items after query/scope/facet filtering.
 * rendered = items currently mounted, which may be paginated.
 */
export type DirectoryCounts = {
  available: number;
  matches: number;
  rendered: number;
  noun: string;
};

export function directoryCountLabel({ available, matches, rendered, noun }: DirectoryCounts): string {
  return `Showing ${rendered} of ${matches} matches · ${available} ${noun} total`;
}
