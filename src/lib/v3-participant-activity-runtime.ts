import { useQuery } from "@tanstack/react-query";

import { v3ParticipantActivityQueryKey } from "./v3-participant-activity";
import { getV3ParticipantActivity } from "./v3-participant-activity.functions";

/**
 * The RPC resolves identity from the authenticated session. The viewer ID is
 * used only for browser-cache partitioning and to disable the query until
 * the route and authenticated identity agree.
 */
export function useV3ParticipantActivity(
  viewerId: string | null | undefined,
  enabled: boolean,
) {
  const scopedViewerId = viewerId?.trim() || null;
  return useQuery({
    queryKey: v3ParticipantActivityQueryKey(scopedViewerId),
    queryFn: () => getV3ParticipantActivity(),
    enabled: enabled && Boolean(scopedViewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
