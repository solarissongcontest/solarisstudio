import { useQuery } from "@tanstack/react-query";

import {
  getV3ArtistIndexProjection,
  getV3ArtistProjection,
  getV3SongIndexProjection,
  getV3SongProjection,
} from "./v3-music-entities.functions";

const DEFAULT_INDEX_LIMIT = 50;
const MAX_INDEX_LIMIT = 100;

function boundedIndexLimit(limit: number) {
  if (!Number.isFinite(limit)) return DEFAULT_INDEX_LIMIT;
  return Math.max(1, Math.min(MAX_INDEX_LIMIT, Math.floor(limit)));
}

export function useV3ArtistProjection(id: string) {
  const normalized = id.trim();
  return useQuery({
    queryKey: ["v3-music-artist", normalized],
    queryFn: () => getV3ArtistProjection({ data: { id: normalized } }),
    enabled: Boolean(normalized),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3SongProjection(id: string) {
  const normalized = id.trim();
  return useQuery({
    queryKey: ["v3-music-song", normalized],
    queryFn: () => getV3SongProjection({ data: { id: normalized } }),
    enabled: Boolean(normalized),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3ArtistIndexProjection(query = "", limit = DEFAULT_INDEX_LIMIT) {
  const normalized = query.trim();
  const boundedLimit = boundedIndexLimit(limit);
  return useQuery({
    queryKey: ["v3-music-artists", normalized, boundedLimit],
    queryFn: () =>
      getV3ArtistIndexProjection({
        data: { query: normalized || null, limit: boundedLimit },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3SongIndexProjection(query = "", limit = DEFAULT_INDEX_LIMIT) {
  const normalized = query.trim();
  const boundedLimit = boundedIndexLimit(limit);
  return useQuery({
    queryKey: ["v3-music-songs", normalized, boundedLimit],
    queryFn: () =>
      getV3SongIndexProjection({
        data: { query: normalized || null, limit: boundedLimit },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
