import { useQuery } from "@tanstack/react-query";

import { getV3SavedProjection } from "./v3-saved.functions";

export function useV3SavedProjection(
  enabled: boolean,
  viewerId: string | null | undefined,
) {
  const normalizedViewerId = viewerId?.trim() || null;
  return useQuery({
    queryKey: ["v3-saved-projection", normalizedViewerId ?? "anonymous"],
    queryFn: () => getV3SavedProjection(),
    enabled: enabled && Boolean(normalizedViewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
