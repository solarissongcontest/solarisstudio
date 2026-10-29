import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/music/index.tsx");
const screen = () => read("src/components/v3/V3MusicDiscoveryScreen.tsx");
const primitives = () => read("src/components/v3/V3MusicPrimitives.tsx");
const entityScreens = () => read("src/components/v3/V3MusicEntityScreens.tsx");
const dataError = () => read("src/components/v3/V3MusicDataError.tsx");
const songsRoute = () => read("src/routes/songs/index.tsx");
const artistsRoute = () => read("src/routes/artists/index.tsx");
const songRoute = () => read("src/routes/songs/$songId.tsx");
const artistRoute = () => read("src/routes/artists/$artistId.tsx");

describe("V3 Songs & Artists discovery", () => {
  it("owns a dedicated public music root rather than substituting Edition", () => {
    expect(route()).toContain('createFileRoute("/music/")');
    expect(route()).toContain("<V3MusicDiscoveryScreen");
    expect(route()).not.toContain("/editions/");
    expect(screen()).toContain('title="Songs & artists"');
  });

  it("keeps root discovery bounded instead of dumping the complete catalogue", () => {
    const source = screen();
    expect(source).toContain("const ROOT_SONG_LIMIT = 6");
    expect(source).toContain("const ROOT_ARTIST_LIMIT = 6");
    expect(source).toContain("songs?.items.slice(0, ROOT_SONG_LIMIT)");
    expect(source).toContain("artists?.items.slice(0, ROOT_ARTIST_LIMIT)");
    expect(source).toContain('title="Browse all songs"');
    expect(source).toContain('title="Browse all artists"');
  });

  it("uses durable Song and Artist routes through reusable music presentation", () => {
    const source = primitives();
    expect(source).toContain("v3SongHref(song.id)");
    expect(source).toContain("v3ArtistHref(artist.id)");
    expect(source).toContain("V3SongPreview");
    expect(source).toContain("V3ArtistPreview");
    expect(source).not.toContain("slugify");
    expect(source).not.toContain("toLowerCase()");
  });

  it("uses the dedicated music primitives on complete collections instead of generic action-card rows", () => {
    const source = entityScreens();
    expect(source).toContain("<V3SongPreview");
    expect(source).toContain("<V3ArtistPreview");
    expect(source).toContain('to="/music"');
    expect(source).toContain("Published appearance");
    expect(source).not.toContain('description="Artist profile"');
    expect(source).not.toContain('description="Open song"');
  });

  it("keeps canonical URLs on the music root, complete collections and opaque entity routes", () => {
    expect(route()).toContain("https://studio.solaris-song-contest.workers.dev/music");
    expect(songsRoute()).toContain("https://studio.solaris-song-contest.workers.dev/songs");
    expect(artistsRoute()).toContain("https://studio.solaris-song-contest.workers.dev/artists");
    expect(songRoute()).toContain("encodeURIComponent(params.songId)");
    expect(artistRoute()).toContain("encodeURIComponent(params.artistId)");
    expect(songRoute()).not.toContain("song.title");
    expect(artistRoute()).not.toContain("artist.displayName");
  });

  it("never labels an unresolved sibling query unavailable while it is still loading", () => {
    const source = route();
    expect(source).toContain("if (songs.isLoading || artists.isLoading)");
    expect(source).not.toContain("songs.isLoading && artists.isLoading");
  });

  it("separates retryable projection failures from invalid or non-public identity", () => {
    expect(dataError()).toContain("Retry");
    expect(dataError()).toContain("onRetry={() => void onRetry()}");
    expect(dataError()).toContain("will not substitute raw Entry data");

    for (const source of [songsRoute(), artistsRoute(), songRoute(), artistRoute()]) {
      expect(source).toContain("projection.isError");
      expect(source).toContain("<V3MusicDataError");
      expect(source).toContain("projection.refetch()");
      expect(source).toContain("!projection.data");
      expect(source).toContain("<V3MusicUnavailable");
    }

    expect(route()).toContain("songs.isError && artists.isError");
    expect(route()).toContain("Promise.all([songs.refetch(), artists.refetch()])");
    expect(screen()).toContain("onRetrySongs");
    expect(screen()).toContain("onRetryArtists");
  });

  it("never falls back to raw Entry or direct Supabase reads", () => {
    const combined = `${route()}\n${screen()}\n${primitives()}\n${entityScreens()}\n${dataError()}`;
    expect(combined).not.toContain("supabase");
    expect(combined).not.toContain('.from("entries")');
    expect(combined).not.toContain("useEntries");
    expect(combined).not.toContain("useAllParticipants");
  });

  it("keeps music searches shareable and bounded on root and complete collections", () => {
    for (const source of [route(), songsRoute(), artistsRoute()]) {
      expect(source).toContain("validateSearch");
      expect(source).toContain("slice(0, 120)");
      expect(source).toContain("Route.useSearch()");
      expect(source).toContain("replace: true");
    }
    expect(screen()).toContain("maxLength={120}");
  });

  it("does not invent chronology or media fields absent from the public P9 index", () => {
    const source = screen();
    expect(source).not.toContain("Recent reveals");
    expect(source).not.toContain("publishedAt");
    expect(source).not.toContain("spotify");
    expect(source).not.toContain("youtube");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });
});
