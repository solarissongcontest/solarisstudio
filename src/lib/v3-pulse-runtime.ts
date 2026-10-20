import { useInfiniteQuery } from "@tanstack/react-query";

import type { PulseCategory } from "./pulse";
import { getV3PublicPulse } from "./v3-pulse.functions";
import type { V3PulseCursor } from "./v3-pulse";

export function useV3PublicPulse(category: PulseCategory | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["v3-public-pulse", category ?? "all"],
    queryFn: ({ pageParam }) =>
      getV3PublicPulse({ data: { cursor: pageParam, category } }),
    initialPageParam: null as V3PulseCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
