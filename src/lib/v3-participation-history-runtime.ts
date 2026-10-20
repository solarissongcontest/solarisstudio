import { useQuery } from "@tanstack/react-query";

import { getV3ParticipationHistory } from "./v3-participation-history.functions";

export function useV3ParticipationHistory(viewerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["v3-participation-history", viewerId],
    queryFn: () => getV3ParticipationHistory(),
    enabled: Boolean(enabled && viewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
