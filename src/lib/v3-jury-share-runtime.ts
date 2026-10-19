import { useQuery } from "@tanstack/react-query";

import { getV3PublicJuryShareProjection } from "./v3-jury-share.functions";

export function useV3PublicJuryShareProjection(input: {
  showId: string;
  countryId: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["v3-public-jury-share", input.showId, input.countryId],
    queryFn: () =>
      getV3PublicJuryShareProjection({
        data: { showId: input.showId, countryId: input.countryId },
      }),
    enabled: input.enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
