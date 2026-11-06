/**
 * Pure state machine for the TG3 World publication gate.
 *
 * Strict routes must observe a successful feature-flag read after this
 * component mounted. Cached "enabled" data or a refetch currently in
 * progress cannot establish publication permission.
 */
export type PublicWorldRolloutSnapshot = {
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  data: boolean | undefined;
};

export type PublicWorldRolloutDisplay = "error" | "checking" | "disabled" | "enabled";

export function publicWorldRolloutDisplay(
  state: PublicWorldRolloutSnapshot, verifyOnMount: boolean,
): PublicWorldRolloutDisplay {
  if (state.isError) return "error";
  if (state.isPending || (verifyOnMount && (!state.isFetchedAfterMount || state.isFetching))) {
    return "checking";
  }
  return state.data === true ? "enabled" : "disabled";
}
