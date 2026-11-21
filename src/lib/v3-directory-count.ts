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


/**
 * When server-owned rollout removes a category during the visit, do not keep
 * filtering by an obsolete category ID while the controls claim "All".
 * The directory never needs to render forbidden links to recover navigation.
 */
export function resolveDirectoryScope(
  requested: string,
  availableGroups: readonly { id: string }[],
): string {
  if (requested === "all") return "all";
  return availableGroups.some((group) => group.id === requested)
    ? requested
    : "all";
}
