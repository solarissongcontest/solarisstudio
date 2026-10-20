import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { PulseCategory } from "./pulse";
import { getV3PublicPulseEvents } from "./v3-public-pulse.functions";
import type { V3PublicPulseCursor } from "./v3-public-pulse";

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

export function useV3PublicPulsePages(
  category: PulseCategory | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ["v3-public-pulse-pages", category ?? "all"],
    queryFn: ({ pageParam }) => getV3PublicPulseEvents({
      data: {
        limit: 30,
        cursor: pageParam,
        category,
      },
    }),
    initialPageParam: null as V3PublicPulseCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
