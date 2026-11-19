/**
 * Edition-directory result history is an optional large read for the installed
 * app, but part of the initial published web directory. Runtime starts as
 * unresolved/web, so never infer permission to fetch from that default.
 *
 * The query itself remains publication-filtered by the existing Edition/Show
 * and Results consumers. This guard controls timing/egress, not authority.
 */
export function canStartPublishedEditionResultsRead(
  platformResolved: boolean,
  isAppMode: boolean,
  appDeferredReady: boolean,
): boolean {
  return platformResolved && (!isAppMode || appDeferredReady);
}
