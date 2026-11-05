import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const SOURCE = "src/integrations/v3/music-entities-source.server.ts";
const FUNCTIONS = "src/lib/v3-music-entities.functions.ts";
const MODEL = "src/lib/v3-music-entities.ts";
const SCREENS = "src/components/v3/V3MusicEntityScreens.tsx";
const ARTIST_ROUTE = "src/routes/artists/$artistId.tsx";
const SONG_ROUTE = "src/routes/songs/$songId.tsx";

const PUBLIC_RPC_NAMES = [
  "v3_public_artist",
  "v3_public_song",
  "v3_public_artists",
  "v3_public_songs",
] as const;

describe("Public V3 P9 Artist/Song consumer", () => {
  it("consumes only the System-owned publication-safe music RPCs", () => {
    const server = source(SOURCE);

    for (const rpc of PUBLIC_RPC_NAMES) expect(server).toContain(`\"${rpc}\"`);
    expect(server).not.toContain(".from(");
    expect(server).not.toContain("private.v3_music");
    expect(server).not.toContain('from("entries")');
    expect(server).not.toContain('from("participants")');
    expect(server).not.toContain("supabase.auth");
  });

  it("validates opaque detail ids and bounds public discovery inputs", () => {
    const functions = source(FUNCTIONS);

    expect(functions).toContain("z.string().uuid()");
    expect(functions).toContain(".max(120)");
    expect(functions).toContain(".max(100)");
    expect(functions).toContain("loadV3ArtistProjection(data.id)");
    expect(functions).toContain("loadV3SongProjection(data.id)");
  });

  it("uses opaque route ids and follows only explicit System redirects", () => {
    const artist = source(ARTIST_ROUTE);
    const song = source(SONG_ROUTE);

    expect(artist).toContain('createFileRoute("/artists/$artistId")');
    expect(song).toContain('createFileRoute("/songs/$songId")');
    expect(artist).toContain('projection.data.kind === "artist_redirect"');
    expect(song).toContain('projection.data.kind === "song_redirect"');
    expect(artist).toContain("v3ArtistHref(projection.data.redirectTo)");
    expect(song).toContain("v3SongHref(projection.data.redirectTo)");
    expect(artist).not.toContain("slugify");
    expect(song).not.toContain("slugify");
  });

  it("never derives canonical identity from display name or song title", () => {
    const model = source(MODEL);
    const screens = source(SCREENS);

    expect(model).toContain("v3ArtistHref(id)");
    expect(model).toContain("v3SongHref(id)");
    expect(screens).toContain("v3ArtistHref(artist.id)");
    expect(screens).toContain("v3SongHref(song.id)");
    expect(model).not.toContain("slugify");
    expect(model).not.toContain("toLocaleLowerCase");
    expect(model).not.toContain("displayName.toLowerCase");
    expect(model).not.toContain("title.toLowerCase");
  });

  it("keeps Entry media, credits and result authority outside the identity consumer", () => {
    const server = source(SOURCE);
    const screens = source(SCREENS);

    for (const forbidden of [
      "youtube",
      "spotify",
      "apple_music",
      "media_assets",
      "results.update",
    ] as const) {
      expect(server.toLowerCase()).not.toContain(forbidden);
    }
    expect(screens).toContain(
      "Credits, media, participation state and results remain owned by their existing Entry and Results projections.",
    );
    expect(screens).toContain(
      "Audio, video, artwork, credits and official results remain authoritative on their canonical Entry and Results surfaces.",
    );
  });

  it("fails closed rather than reconstructing hidden identity from legacy Entry labels", () => {
    const artist = source(ARTIST_ROUTE);
    const song = source(SONG_ROUTE);
    const server = source(SOURCE);

    expect(artist).toContain("This Artist identity is not public");
    expect(song).toContain("This Song identity is not public");
    expect(server).toContain("fails closed instead of manufacturing identity in the browser");
    expect(server).not.toContain('.from("entries")');
    expect(server).not.toContain("buildV3EntryExploreProjection");
  });
});
