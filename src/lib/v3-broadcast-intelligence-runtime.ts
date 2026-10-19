import { useQuery } from "@tanstack/react-query";

import { getV3BroadcastIntelligenceBundle } from "./v3-broadcast-intelligence.functions";

export function useV3BroadcastIntelligenceBundle(
  showId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["v3-broadcast-intelligence-bundle", showId ?? "latest"],
    queryFn: () =>
      getV3BroadcastIntelligenceBundle({ data: { showId } }),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
