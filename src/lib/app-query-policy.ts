export type SolarisQueryFreshness = "live" | "warm" | "cold";

export const SOLARIS_QUERY_POLICY = {
  live: {
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always" as const,
    meta: { solarisFreshness: "live" as const },
  },
  warm: {
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    meta: { solarisFreshness: "warm" as const },
  },
  cold: {
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: { solarisFreshness: "cold" as const },
  },
} satisfies Record<
  SolarisQueryFreshness,
  {
    staleTime: number;
    gcTime: number;
    refetchOnMount: boolean | "always";
    refetchOnWindowFocus: boolean;
    refetchOnReconnect: boolean | "always";
    meta: { solarisFreshness: SolarisQueryFreshness };
  }
>;

export function solarisQueryPolicy(freshness: SolarisQueryFreshness) {
  return SOLARIS_QUERY_POLICY[freshness];
}

export function freshnessLevelsForResume(backgroundDurationMs: number) {
  const levels: SolarisQueryFreshness[] = [];
  if (backgroundDurationMs >= SOLARIS_QUERY_POLICY.live.staleTime) levels.push("live");
  if (backgroundDurationMs >= SOLARIS_QUERY_POLICY.warm.staleTime) levels.push("warm");
  if (backgroundDurationMs >= SOLARIS_QUERY_POLICY.cold.staleTime) levels.push("cold");
  return levels;
}
