import { useQuery } from "@tanstack/react-query";

import {
  getV3RelationshipDetailBundle,
  getV3RelationshipsIndexBundle,
} from "./v3-relationships.functions";

export function useV3RelationshipsIndexBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-relationships-index-bundle"],
    queryFn: () => getV3RelationshipsIndexBundle(),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function useV3RelationshipDetailBundle(pair: string, enabled: boolean) {
  const normalizedPair = pair.trim().toUpperCase();
  return useQuery({
    queryKey: ["v3-relationship-detail-bundle", normalizedPair],
    queryFn: () =>
      getV3RelationshipDetailBundle({ data: { pair: normalizedPair } }),
    enabled: enabled && Boolean(normalizedPair),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
