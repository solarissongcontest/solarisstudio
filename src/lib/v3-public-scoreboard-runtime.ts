import { useQuery } from "@tanstack/react-query";
import { getV3PublicScoreboard } from "./v3-public-scoreboard.functions";

export function useV3PublicScoreboard(showId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["v3-public-scoreboard", showId],
    queryFn: () => getV3PublicScoreboard({ data: { showId } }),
    enabled: enabled && Boolean(showId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
