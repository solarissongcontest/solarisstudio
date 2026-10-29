import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/music/index.tsx");
const screen = () => read("src/components/v3/V3MusicDiscoveryScreen.tsx");
const primitives = () => read("src/components/v3/V3MusicPrimitives.tsx");
const songsRoute = () => read("src/routes/songs/index.tsx");
const artistsRoute = () => read("src/routes/artists/index.tsx");

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

  it("never falls back to raw Entry or direct Supabase reads", () => {
    const combined = `${route()}\n${screen()}\n${primitives()}`;
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
