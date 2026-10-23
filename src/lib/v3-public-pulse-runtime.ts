import { useQuery } from "@tanstack/react-query";

import { getV3PublicPulseEvents } from "./v3-public-pulse.functions";

export function useV3PublicPulseEvents(requestedLimit = 30) {
  const limit = Math.max(1, Math.min(50, Math.trunc(requestedLimit || 30)));
  return useQuery({
    // Preserve the legacy key so existing follow mutations continue to
    // invalidate public event consumers while the source changes underneath.
    queryKey: ["content-events", limit],
    queryFn: () => getV3PublicPulseEvents({ data: { limit } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
