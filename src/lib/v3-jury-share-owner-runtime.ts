import { useQuery } from "@tanstack/react-query";

import { getV3OwnerJuryShareProjection } from "./v3-jury-share-owner.functions";

export function useV3OwnerJuryShareProjection(input: {
  showId: string;
  countryId: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["v3-owner-jury-share", input.showId, input.countryId],
    queryFn: () =>
      getV3OwnerJuryShareProjection({
        data: { showId: input.showId, countryId: input.countryId },
      }),
    enabled: input.enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
