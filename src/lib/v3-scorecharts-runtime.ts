import { useQuery } from "@tanstack/react-query";

import { getV3ScorechartsBundle } from "./v3-scorecharts.functions";

export function useV3ScorechartsBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-scorecharts-bundle"],
    queryFn: () => getV3ScorechartsBundle(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}
