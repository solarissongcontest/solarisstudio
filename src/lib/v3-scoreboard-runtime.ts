import { useQuery } from "@tanstack/react-query";

import { getV3ScoreboardBundle } from "./v3-scoreboard.functions";

export function useV3ScoreboardBundle(
  showId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["v3-scoreboard-bundle", showId ?? "none"],
    queryFn: () => getV3ScoreboardBundle({ data: { showId: showId! } }),
    enabled: enabled && Boolean(showId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
