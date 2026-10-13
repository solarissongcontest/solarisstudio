import { useQuery } from "@tanstack/react-query";

import { getV3ExploreBundle } from "./v3-explore.functions";

export function useV3ExploreBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-explore-bundle"],
    queryFn: () => getV3ExploreBundle(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
