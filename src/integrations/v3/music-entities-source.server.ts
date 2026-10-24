import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  parseV3ArtistIndexProjection,
  parseV3ArtistProjection,
  parseV3SongIndexProjection,
  parseV3SongProjection,
  type V3ArtistIndexProjection,
  type V3ArtistProjection,
  type V3SongIndexProjection,
  type V3SongProjection,
} from "@/lib/v3-music-entities";

type MusicProjectionClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function client() {
  return createConfirmationPublicRuntimeClient() as unknown as MusicProjectionClient;
}

/**
 * Public P9 reads only the System-owned caller-invariant RPCs. There is no
 * fallback to Entry display text and no direct access to the private identity
 * registry. If the System projection is unavailable, the Public surface fails
 * closed instead of manufacturing identity in the browser.
 */
export async function loadV3ArtistProjection(artistId: string): Promise<V3ArtistProjection> {
  const response = await client().rpc("v3_public_artist", { p_artist_id: artistId });
  throwIfError(response.error, "Could not load public Artist projection");
  return parseV3ArtistProjection(response.data);
}

export async function loadV3SongProjection(songId: string): Promise<V3SongProjection> {
  const response = await client().rpc("v3_public_song", { p_song_id: songId });
  throwIfError(response.error, "Could not load public Song projection");
  return parseV3SongProjection(response.data);
}

export async function loadV3ArtistIndexProjection(input: {
  query?: string | null;
  limit?: number;
} = {}): Promise<V3ArtistIndexProjection> {
  const response = await client().rpc("v3_public_artists", {
    p_query: input.query?.trim() || null,
    p_limit: input.limit ?? 50,
  });
  throwIfError(response.error, "Could not load public Artist index");
  return parseV3ArtistIndexProjection(response.data);
}

export async function loadV3SongIndexProjection(input: {
  query?: string | null;
  limit?: number;
} = {}): Promise<V3SongIndexProjection> {
  const response = await client().rpc("v3_public_songs", {
    p_query: input.query?.trim() || null,
    p_limit: input.limit ?? 50,
  });
  throwIfError(response.error, "Could not load public Song index");
  return parseV3SongIndexProjection(response.data);
}
