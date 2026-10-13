import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getV3PrimarySurfaceBundle } from "./v3-primary-surface.functions";
import {
  getV3EditionRolloutProbe,
  getV3RolloutProbe,
} from "./v3-rollout-probe.functions";

export const V3_ROLLOUT_QUERY_KEY = ["v3-rollout-probe"] as const;

export function useV3RolloutProbe(enabled: boolean) {
  const queryClient = useQueryClient();
  const activeProbeObservers =
    queryClient
      .getQueryCache()
      .find({ queryKey: V3_ROLLOUT_QUERY_KEY, exact: true })
      ?.getObserversCount() ?? 0;

  return useQuery({
    queryKey: V3_ROLLOUT_QUERY_KEY,
    queryFn: () => getV3RolloutProbe(),
    enabled,
    staleTime: 0,
    gcTime: 0,
    // The first mounted gate always asks the server. Nested consumers on the
    // same mounted route must reuse that authoritative observer instead of
    // launching a second probe that could race the route-level decision.
    refetchOnMount: activeProbeObservers > 0 ? false : "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3EditionRolloutProbe(slug: string, enabled: boolean) {
  const normalizedSlug = slug.trim();
  return useQuery({
    queryKey: ["v3-edition-rollout-probe", normalizedSlug],
    queryFn: () =>
      getV3EditionRolloutProbe({ data: { slug: normalizedSlug } }),
    enabled: enabled && Boolean(normalizedSlug),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3PrimarySurfaceBundle(
  enabled: boolean,
  editionId: string | null | undefined,
  viewerId: string | null | undefined,
) {
  const normalizedEditionId = editionId?.trim() || null;
  const normalizedViewerId = viewerId?.trim() || null;
  return useQuery({
    queryKey: [
      "v3-primary-surface-bundle",
      normalizedEditionId ?? "current",
      normalizedViewerId ?? "anonymous",
    ],
    queryFn: () =>
      getV3PrimarySurfaceBundle({
        data: { editionId: normalizedEditionId },
      }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
