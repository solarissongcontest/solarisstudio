import { useQuery } from "@tanstack/react-query";

import { getV3ParticipationHistory } from "./v3-participation-history.functions";

export function useV3ParticipationHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-participation-history"],
    queryFn: () => getV3ParticipationHistory(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
