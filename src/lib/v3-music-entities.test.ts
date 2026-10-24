import { describe, expect, it } from "vitest";

import {
  parseV3ArtistIndexProjection,
  parseV3ArtistProjection,
  parseV3SongIndexProjection,
  parseV3SongProjection,
  v3ArtistHref,
  v3SongHref,
} from "./v3-music-entities";

const serverTime = "2026-10-20T06:30:00.000Z";

describe("V3 first-class Artist and Song projections", () => {
  it("keeps namesake Artists distinct by opaque System id", () => {
    const projection = parseV3ArtistIndexProjection({
      schema_version: 1,
      server_time: serverTime,
      items: [
        { id: "11111111-1111-4111-8111-111111111111", display_name: "Nova" },
        { id: "22222222-2222-4222-8222-222222222222", display_name: "Nova" },
      ],
    });

    expect(projection.items).toHaveLength(2);
    expect(projection.items[0]?.displayName).toBe(projection.items[1]?.displayName);
    expect(projection.items[0]?.id).not.toBe(projection.items[1]?.id);
    expect(v3ArtistHref(projection.items[0]!.id)).toContain(projection.items[0]!.id);
    expect(v3ArtistHref(projection.items[1]!.id)).toContain(projection.items[1]!.id);
  });

  it("keeps unrelated same-title Songs distinct and preserves ordered Artist credits", () => {
    const projection = parseV3SongIndexProjection({
      schema_version: 1,
      server_time: serverTime,
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Home",
          artists: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              display_name: "Nova",
              position: 1,
            },
          ],
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Home",
          artists: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              display_name: "Nova",
              position: 1,
            },
          ],
        },
      ],
    });

    expect(projection.items).toHaveLength(2);
    expect(projection.items[0]?.title).toBe(projection.items[1]?.title);
    expect(projection.items[0]?.id).not.toBe(projection.items[1]?.id);
    expect(projection.items[0]?.artists[0]?.position).toBe(1);
  });

  it("parses Artist detail without promoting appearance labels into identity", () => {
    const projection = parseV3ArtistProjection({
      schema_version: 1,
      type: "artist",
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Nova",
      bio: "Published biography",
      aliases: [{ name: "NOVA", edition_id: null }],
      songs: [{ id: "33333333-3333-4333-8333-333333333333", title: "Home" }],
      appearances: [
        {
          entry_id: "55555555-5555-4555-8555-555555555555",
          edition_id: "66666666-6666-4666-8666-666666666666",
          country_id: "77777777-7777-4777-8777-777777777777",
          artist_label: "Nova feat. Guest",
          song_label: "Home",
        },
      ],
      server_time: serverTime,
    });

    expect(projection?.kind).toBe("artist");
    if (!projection || projection.kind !== "artist") throw new Error("Expected Artist detail");
    expect(projection.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(projection.appearances[0]?.artistLabel).toBe("Nova feat. Guest");
    expect(projection.songs[0]?.id).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("parses durable redirect projections without exposing a source label", () => {
    const artist = parseV3ArtistProjection({
      schema_version: 1,
      type: "artist_redirect",
      requested_id: "11111111-1111-4111-8111-111111111111",
      redirect_to: "22222222-2222-4222-8222-222222222222",
      server_time: serverTime,
    });
    const song = parseV3SongProjection({
      schema_version: 1,
      type: "song_redirect",
      requested_id: "33333333-3333-4333-8333-333333333333",
      redirect_to: "44444444-4444-4444-8444-444444444444",
      server_time: serverTime,
    });

    expect(artist).toEqual({
      kind: "artist_redirect",
      schemaVersion: 1,
      requestedId: "11111111-1111-4111-8111-111111111111",
      redirectTo: "22222222-2222-4222-8222-222222222222",
      serverTime,
    });
    expect(song?.kind).toBe("song_redirect");
  });

  it("rejects unsupported schemas and malformed credit positions", () => {
    expect(() =>
      parseV3ArtistProjection({
        schema_version: 2,
        type: "artist",
        server_time: serverTime,
      }),
    ).toThrow("Unsupported Artist/Song projection schema version");

    expect(() =>
      parseV3SongProjection({
        schema_version: 1,
        type: "song",
        id: "33333333-3333-4333-8333-333333333333",
        title: "Home",
        artists: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            display_name: "Nova",
            position: 0,
          },
        ],
        appearances: [],
        server_time: serverTime,
      }),
    ).toThrow("positive integer");
  });

  it("builds detail hrefs from opaque ids rather than display labels", () => {
    const artistId = "11111111-1111-4111-8111-111111111111";
    const songId = "33333333-3333-4333-8333-333333333333";

    expect(v3ArtistHref(artistId)).toBe(`/artists/${artistId}`);
    expect(v3SongHref(songId)).toBe(`/songs/${songId}`);
    expect(v3ArtistHref(artistId)).not.toContain("nova");
    expect(v3SongHref(songId)).not.toContain("home");
  });
});
