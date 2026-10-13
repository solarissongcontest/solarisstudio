import { useQuery } from "@tanstack/react-query";

import { getV3DelegationBundle } from "./v3-delegation.functions";

export function useV3DelegationBundle(code: string, enabled: boolean) {
  const normalizedCode = code.trim().toUpperCase();
  return useQuery({
    queryKey: ["v3-delegation-bundle", normalizedCode],
    queryFn: () => getV3DelegationBundle({ data: { code: normalizedCode } }),
    enabled: enabled && Boolean(normalizedCode),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
