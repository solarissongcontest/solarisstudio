/**
 * Public prediction screens must never interpret an unverified round, fan
 * session or saved prediction as an empty/unpublished result.
 *
 * Failed background refetches take priority over cached data, so a stale
 * saved prediction cannot be silently overwritten while the service is down.
 */
export type PredictionReadQuery = Readonly<{
  isError: boolean;
  isLoading: boolean;
}>;

export type PredictionReadStatus = "loading" | "error" | "ready";

export function predictionReadStatus(
  ...queries: Array<PredictionReadQuery | undefined>
): PredictionReadStatus {
  if (queries.some((query) => query?.isError === true)) return "error";
  if (queries.some((query) => query?.isLoading === true)) return "loading";
  return "ready";
}
