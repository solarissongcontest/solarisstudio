import { useQuery } from "@tanstack/react-query";

import { getV3EntryBundle } from "./v3-entry.functions";

export function useV3EntryBundle(enabled: boolean, viewerId: string | null | undefined) {
  const normalizedViewerId = viewerId?.trim() || null;
  return useQuery({
    queryKey: ["v3-entry-bundle", normalizedViewerId ?? "anonymous"],
    queryFn: () => getV3EntryBundle(),
    enabled: enabled && Boolean(normalizedViewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
