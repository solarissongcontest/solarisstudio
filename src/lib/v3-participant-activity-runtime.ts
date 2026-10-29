import { useQuery } from "@tanstack/react-query";

import { useFanSession } from "./prediction-data";
import { getV3ParticipantActivity } from "./v3-participant-activity.functions";

export function participantActivityQueryKey(viewerId: string | null) {
  return ["v3-participant-activity", viewerId] as const;
}

export function useV3ParticipantActivity(enabled: boolean) {
  // Identity namespaces the private cache only. The server still derives the
  // recipient exclusively from the authenticated request, never this UI value.
  const viewerId = useFanSession().data?.id ?? null;
  return useQuery({
    queryKey: participantActivityQueryKey(viewerId),
    queryFn: () => getV3ParticipantActivity(),
    enabled: enabled && Boolean(viewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
