import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { getV3OrganizerProjection } from "@/lib/v3-organizer-projection.functions";
import { organizerProjectionQueryKey } from "@/lib/v3-organizer-projection-key";

export function useV3OrganizerProjection(editionId: string | null | undefined) {
  const actorId = useAuthenticatedUser().id;
  const load = useServerFn(getV3OrganizerProjection);
  const normalized = editionId?.trim() || null;

  return useQuery({
    enabled: Boolean(actorId && normalized),
    // This projection includes private operational and audit information. An
    // edition alone is not a safe cache namespace after an account switch.
    queryKey: organizerProjectionQueryKey(actorId, normalized),
    queryFn: () => load({ data: { editionId: normalized! } }),
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
