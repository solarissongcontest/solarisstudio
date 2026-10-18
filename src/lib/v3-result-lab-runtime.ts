import { useQuery } from "@tanstack/react-query";

import { getV3ResultLabBundle } from "./v3-result-lab.functions";

export function useV3ResultLabBundle(showId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["v3-result-lab-bundle", showId ?? "latest"],
    queryFn: () => getV3ResultLabBundle({ data: { showId } }),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
