import { useQuery } from "@tanstack/react-query";

import { getV3ParticipantActivity } from "./v3-participant-activity.functions";

export function useV3ParticipantActivity(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-participant-activity"],
    queryFn: () => getV3ParticipantActivity(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
