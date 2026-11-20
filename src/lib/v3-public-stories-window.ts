/**
 * The existing studio2_public_storylines public RPC caps each response at
 * 100 published editions. Do not claim that a bounded response is the entire
 * historical catalogue, or silently truncate the list after the first batch.
 *
 * This is a read-side navigation contract; SQL publication remains canonical.
 */
export const PUBLIC_STORY_INITIAL_WINDOW = 30;
export const PUBLIC_STORY_WINDOW_STEP = 30;
export const PUBLIC_STORY_RPC_MAX = 100;

export function normalizeStoryWindow(size: number): number {
  if (!Number.isFinite(size)) return PUBLIC_STORY_INITIAL_WINDOW;
  return Math.min(PUBLIC_STORY_RPC_MAX, Math.max(1, Math.trunc(size)));
}

export function nextStoryWindow(size: number): number {
  return Math.min(PUBLIC_STORY_RPC_MAX, normalizeStoryWindow(size) + PUBLIC_STORY_WINDOW_STEP);
}

/** Read one extra record to know if a browsing "more" control is warranted. */
export function storyReadLimit(size: number, searching: boolean): number {
  if (searching) return PUBLIC_STORY_RPC_MAX;
  return Math.min(PUBLIC_STORY_RPC_MAX, normalizeStoryWindow(size) + 1);
}

export function projectPublicStoryWindow<T>(
  rows: readonly T[],
  size: number,
  searching: boolean,
): { visible: T[]; hasMore: boolean; capped: boolean } {
  const window = normalizeStoryWindow(size);
  return {
    visible: searching ? [...rows] : rows.slice(0, window),
    hasMore: !searching && window < PUBLIC_STORY_RPC_MAX && rows.length > window,
    capped: rows.length === PUBLIC_STORY_RPC_MAX,
  };
}
