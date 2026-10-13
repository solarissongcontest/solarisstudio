import { useQuery } from "@tanstack/react-query";

import { getV3EditionBundle } from "./v3-edition.functions";

export function useV3EditionBundle(slug: string, enabled: boolean) {
  const normalizedSlug = slug.trim();
  return useQuery({
    queryKey: ["v3-edition-bundle", normalizedSlug],
    queryFn: () => getV3EditionBundle({ data: { slug: normalizedSlug } }),
    enabled: enabled && Boolean(normalizedSlug),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
