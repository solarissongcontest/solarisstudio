import { describe, expect, it } from "vitest";

import {
  entryBoundMusicIdentity,
  firstClassMusicIdentity,
  musicEntityHref,
  musicIdentityIsRoutable,
} from "./v3-artist-song-identity";

describe("Public V3 P9 artist/song identity", () => {
  it("keeps current Entry-scoped artist text non-routable", () => {
    const artist = entryBoundMusicIdentity({
      kind: "artist",
      entryId: "entry-123",
      label: "Same Name",
    });

    expect(artist).toMatchObject({
      kind: "artist",
      identity: "entry_reference",
      entryId: "entry-123",
      label: "Same Name",
      publicEntityId: null,
      href: null,
    });
    expect(musicIdentityIsRoutable(artist)).toBe(false);
    expect(musicEntityHref(artist)).toBeNull();
  });

  it("keeps current Entry-scoped song text non-routable", () => {
    const song = entryBoundMusicIdentity({
      kind: "song",
      entryId: "entry-123",
      label: "Collision Song",
    });

    expect(song.identity).toBe("entry_reference");
    expect(song.href).toBeNull();
  });

  it("routes only opaque first-class public entity ids", () => {
    const artist = firstClassMusicIdentity({
      kind: "artist",
      publicEntityId: "9c6b18b3-c31a-4780-b60a-53fbdaf8209a",
      label: "Artist Name",
    });
    const song = firstClassMusicIdentity({
      kind: "song",
      publicEntityId: "song:stable:01HZZZZZZZZZZZZZZZZZZZZZZZ",
      label: "Song Name",
      entryId: "entry-123",
    });

    expect(musicEntityHref(artist)).toBe("/artists/9c6b18b3-c31a-4780-b60a-53fbdaf8209a");
    expect(musicEntityHref(song)).toBe("/songs/song%3Astable%3A01HZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(musicIdentityIsRoutable(artist)).toBe(true);
    expect(song.entryId).toBe("entry-123");
  });

  it("never derives identity from the display label", () => {
    const first = entryBoundMusicIdentity({ kind: "artist", entryId: "entry-a", label: "Duplicate" });
    const second = entryBoundMusicIdentity({ kind: "artist", entryId: "entry-b", label: "Duplicate" });

    expect(first.href).toBeNull();
    expect(second.href).toBeNull();
    expect(first.entryId).not.toBe(second.entryId);
  });

  it("rejects blank identity inputs", () => {
    expect(() => entryBoundMusicIdentity({ kind: "song", entryId: " ", label: "Title" })).toThrow("Entry id is required");
    expect(() => firstClassMusicIdentity({ kind: "artist", publicEntityId: " ", label: "Artist" })).toThrow("Public entity id is required");
    expect(() => firstClassMusicIdentity({ kind: "artist", publicEntityId: "artist-1", label: " " })).toThrow("Music entity label is required");
  });
});
