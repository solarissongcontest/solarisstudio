import { useQuery } from "@tanstack/react-query";

import { getV3ResultsBundle } from "./v3-results.functions";

export function useV3ResultsBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-results-bundle"],
    queryFn: () => getV3ResultsBundle(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
