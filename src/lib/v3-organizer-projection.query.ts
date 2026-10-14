import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getV3OrganizerProjection } from "@/lib/v3-organizer-projection.functions";

export function useV3OrganizerProjection(editionId: string | null | undefined) {
  const load = useServerFn(getV3OrganizerProjection);
  const normalized = editionId?.trim() || null;

  return useQuery({
    enabled: Boolean(normalized),
    queryKey: ["v3-organizer-projection", normalized],
    queryFn: () => load({ data: { editionId: normalized! } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
