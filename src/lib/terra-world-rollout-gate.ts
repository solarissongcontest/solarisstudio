/**
 * Pure state machine for the TG3 World publication gate.
 *
 * Strict routes must observe a successful feature-flag read after this
 * component mounted. Cached "enabled" data or a refetch currently in
 * progress cannot establish publication permission.
 */
export type PublicWorldRolloutSnapshot = {
  isError: boolean;
  isRefetchError?: boolean;
  isPending: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  data: boolean | undefined;
};

export type PublicWorldRolloutDisplay = "error" | "checking" | "disabled" | "enabled";

export function publicWorldRolloutDisplay(
  state: PublicWorldRolloutSnapshot, verifyOnMount: boolean,
): PublicWorldRolloutDisplay {
  if (state.isError || state.isRefetchError) return "error";
  // A background verification hides previously published identities on ALL World routes.
  if (state.isPending || state.isFetching || (verifyOnMount && !state.isFetchedAfterMount)) {
    return "checking";
  }
  return state.data === true ? "enabled" : "disabled";
}
