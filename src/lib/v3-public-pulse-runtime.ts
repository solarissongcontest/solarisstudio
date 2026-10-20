import { useQuery } from "@tanstack/react-query";

import { getV3PublicPulseEvents } from "./v3-public-pulse.functions";

export function useV3PublicPulseEvents() {
  return useQuery({
    queryKey: ["v3-public-pulse-events"],
    queryFn: () => getV3PublicPulseEvents(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
