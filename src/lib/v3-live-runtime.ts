import { useQuery } from "@tanstack/react-query";

import { getV3LiveBundle } from "./v3-live.functions";

const ACTIVE_LIVE_STATES = new Set([
  "starting_soon",
  "live",
  "paused",
  "delayed",
  "voting",
  "results_pending",
]);

/**
 * Live is the one Public V3 projection that benefits from bounded foreground
 * refresh while event-stream integration is still incomplete. The interval is
 * deliberately state-aware: quiet/complete screens do not poll continuously.
 */
export function useV3LiveBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-live-bundle"],
    queryFn: () => getV3LiveBundle(),
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const state = query.state.data?.experience?.state;
      return state && ACTIVE_LIVE_STATES.has(state) ? 30_000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}
