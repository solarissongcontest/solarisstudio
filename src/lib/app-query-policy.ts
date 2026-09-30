export type SolarisQueryFreshness = "live" | "warm" | "cold";

export const SOLARIS_QUERY_POLICY = {
  live: {
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always" as const,
  },
  warm: {
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  cold: {
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },
} satisfies Record<
  SolarisQueryFreshness,
  {
    staleTime: number;
    gcTime: number;
    refetchOnMount: boolean | "always";
    refetchOnWindowFocus: boolean;
    refetchOnReconnect: boolean | "always";
  }
>;

export function solarisQueryPolicy(freshness: SolarisQueryFreshness) {
  return SOLARIS_QUERY_POLICY[freshness];
}
