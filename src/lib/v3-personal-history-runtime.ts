import { useQuery } from "@tanstack/react-query";

import { getV3PersonalHistory } from "./v3-personal-history.functions";

export function useV3PersonalHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-personal-participation-history"],
    queryFn: () => getV3PersonalHistory(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
