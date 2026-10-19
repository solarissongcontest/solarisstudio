import { useQuery } from "@tanstack/react-query";

import { getV3RecordsBundle } from "./v3-records.functions";

export function useV3RecordsBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-records-bundle"],
    queryFn: () => getV3RecordsBundle(),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
