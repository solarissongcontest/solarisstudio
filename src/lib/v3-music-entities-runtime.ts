import { useQuery } from "@tanstack/react-query";

import {
  getV3ArtistIndexProjection,
  getV3ArtistProjection,
  getV3SongIndexProjection,
  getV3SongProjection,
} from "./v3-music-entities.functions";

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

export function useV3ArtistIndexProjection(query = "") {
  const normalized = query.trim();
  return useQuery({
    queryKey: ["v3-music-artists", normalized],
    queryFn: () =>
      getV3ArtistIndexProjection({
        data: { query: normalized || null, limit: 50 },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useV3SongIndexProjection(query = "") {
  const normalized = query.trim();
  return useQuery({
    queryKey: ["v3-music-songs", normalized],
    queryFn: () =>
      getV3SongIndexProjection({
        data: { query: normalized || null, limit: 50 },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
