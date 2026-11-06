/**
 * A bounded presentation window over the already publication-filtered shows.
 * Keep this independent of data fetching and canonical Show state.
 */
export const V3_SHOW_BROWSE_PAGE_SIZE = 24;

export function getV3ShowBrowsePage<T>(items: readonly T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / V3_SHOW_BROWSE_PAGE_SIZE));
  const safePage = Number.isSafeInteger(page) && page > 0
    ? Math.min(page, totalPages)
    : 1;
  const displayedCount = Math.min(items.length, safePage * V3_SHOW_BROWSE_PAGE_SIZE);

  return {
    visible: items.slice(0, displayedCount),
    remaining: items.length - displayedCount,
    hasMore: displayedCount < items.length,
  };
}
