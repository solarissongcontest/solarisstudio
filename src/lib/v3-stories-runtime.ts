import { useQuery } from "@tanstack/react-query";

import {
  getV3StoriesIndexBundle,
  getV3StoryDetailBundle,
} from "./v3-stories.functions";

export function useV3StoriesIndexBundle(enabled: boolean) {
  return useQuery({
    queryKey: ["v3-stories-index-bundle"],
    queryFn: () => getV3StoriesIndexBundle(),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function useV3StoryDetailBundle(editionSlug: string, enabled: boolean) {
  const cleanSlug = editionSlug.trim();
  return useQuery({
    queryKey: ["v3-story-detail-bundle", cleanSlug],
    queryFn: () => getV3StoryDetailBundle({ data: { editionSlug: cleanSlug } }),
    enabled: enabled && Boolean(cleanSlug),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}
