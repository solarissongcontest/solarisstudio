/** The published Storytelling RPC clamps p_limit to 100. Expand only after a
 * deliberate visitor action, not a background polling or scroll loop.
 */
export const PUBLIC_STORY_INITIAL_BATCH = 30;
export const PUBLIC_STORY_BATCH_STEP = 30;
export const PUBLIC_STORY_RPC_MAX = 100;

export function nextPublicStoryBatchLimit(current: number): number {
  if (!Number.isSafeInteger(current) || current < PUBLIC_STORY_INITIAL_BATCH) {
    return PUBLIC_STORY_INITIAL_BATCH;
  }
  return Math.min(PUBLIC_STORY_RPC_MAX, current + PUBLIC_STORY_BATCH_STEP);
}

/** A full batch might mean either "more available" or "exactly the last
 * record". Offer the action once; the following bounded read resolves it.
 */
export function canExpandPublicStoryBatch(loadedCount: number, requestedLimit: number): boolean {
  return requestedLimit < PUBLIC_STORY_RPC_MAX && loadedCount >= requestedLimit;
}

/**
 * Search uses the currently fetched bounded batch. Offer a deliberate
 * expansion rather than claiming that a zero-match query searched history.
 */
export function canExpandPublishedStorySearch(
  query: string,
  loadedCount: number,
  requestedLimit: number,
): boolean {
  return query.trim().length > 0 &&
    canExpandPublicStoryBatch(loadedCount, requestedLimit);
}

export function publicStoryBatchAtServerCap(
  loadedCount: number,
  requestedLimit: number,
): boolean {
  return requestedLimit >= PUBLIC_STORY_RPC_MAX &&
    loadedCount >= PUBLIC_STORY_RPC_MAX;
}
