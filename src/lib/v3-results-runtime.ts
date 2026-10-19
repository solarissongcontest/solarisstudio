import { useQuery } from "@tanstack/react-query";

import { getV3ResultsBundle } from "./v3-results.functions";

export function useV3ResultsBundle(showId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["v3-results-bundle", showId ?? "latest"],
    queryFn: () => getV3ResultsBundle({ data: { showId } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
