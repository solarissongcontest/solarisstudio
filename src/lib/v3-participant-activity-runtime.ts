import { useInfiniteQuery } from "@tanstack/react-query";

import { getV3ParticipantActivity } from "./v3-participant-activity.functions";
import {
  getV3ParticipantActivityNextCursor,
  type V3ParticipantActivityCursor,
} from "./v3-participant-activity";

export function useV3ParticipantActivity(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["v3-participant-activity"],
    queryFn: ({ pageParam }) =>
      getV3ParticipantActivity({ data: { cursor: pageParam } }),
    initialPageParam: null as V3ParticipantActivityCursor | null,
    getNextPageParam: (lastPage) =>
      getV3ParticipantActivityNextCursor(lastPage) ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
