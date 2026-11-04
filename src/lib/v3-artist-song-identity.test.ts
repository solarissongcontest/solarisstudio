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

  it("routes only System-supplied first-class public entity ids", () => {
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
    const first = entryBoundMusicIdentity({
      kind: "artist",
      entryId: "entry-a",
      label: "Duplicate",
    });
    const second = entryBoundMusicIdentity({
      kind: "artist",
      entryId: "entry-b",
      label: "Duplicate",
    });

    expect(first.href).toBeNull();
    expect(second.href).toBeNull();
    expect(first.entryId).not.toBe(second.entryId);
  });

  it("derives detail URLs from canonical opaque IDs instead of trusting a stale href", () => {
    const artist = firstClassMusicIdentity({
      kind: "artist",
      publicEntityId: "artist:stable:1",
      label: "Original artist",
    });
    const song = firstClassMusicIdentity({
      kind: "song",
      publicEntityId: "song:stable:1",
      label: "Original song",
    });
    if (!musicIdentityIsRoutable(artist) || !musicIdentityIsRoutable(song)) {
      throw new Error("Expected first-class music identities");
    }

    // Even a compromised or stale presentation object must never control
    // the navigation destination independently of the canonical identity.
    expect(musicEntityHref({ ...artist, href: "https://attacker.example/collect" })).toBe(
      "/artists/artist%3Astable%3A1",
    );
    expect(musicEntityHref({ ...song, href: "/artists/wrong-song" })).toBe(
      "/songs/song%3Astable%3A1",
    );
    expect(musicEntityHref({ ...artist, label: "Renamed artist" })).toBe(musicEntityHref(artist));
  });

  it("rejects normalized dot segments instead of navigating outside music detail routes", () => {
    for (const id of [".", "..", " . ", "\t..\n"]) {
      expect(() =>
        firstClassMusicIdentity({ kind: "song", publicEntityId: id, label: "Song" }),
      ).toThrow("Public entity id is not a valid path segment");
    }

    const artist = firstClassMusicIdentity({
      kind: "artist",
      publicEntityId: "durable-artist-id",
      label: "Artist",
    });
    if (!musicIdentityIsRoutable(artist)) {
      throw new Error("Expected a first-class artist identity");
    }
    expect(musicIdentityIsRoutable({ ...artist, publicEntityId: ".." })).toBe(false);
    expect(musicEntityHref({ ...artist, publicEntityId: ".." })).toBeNull();
  });

  it.each([
    ["../other", "/songs/..%2Fother"],
    ["%2e%2e", "/songs/%252e%252e"],
    ["//elsewhere.example", "/songs/%2F%2Felsewhere.example"],
    ["song?redirect=/admin#private", "/songs/song%3Fredirect%3D%2Fadmin%23private"],
  ])("encodes opaque id %j into one canonical path segment", (id, expected) => {
    const song = firstClassMusicIdentity({ kind: "song", publicEntityId: id, label: "Song" });
    const href = musicEntityHref(song);
    const resolved = new URL(href!, "https://solaris.example");

    expect(href).toBe(expected);
    expect(resolved.origin).toBe("https://solaris.example");
    expect(resolved.pathname).toBe(expected);
    expect(resolved.search).toBe("");
    expect(resolved.hash).toBe("");
    expect(decodeURIComponent(resolved.pathname.split("/")[2])).toBe(id);
  });

  it("refuses malformed cached kinds and IDs even when their href looks valid", () => {
    const artist = firstClassMusicIdentity({
      kind: "artist", publicEntityId: "artist-id", label: "Artist",
    });
    for (const identity of [
      { ...artist, kind: "unknown" as never },
      { ...artist, publicEntityId: " " },
      { ...artist, publicEntityId: null as never },
    ]) {
      expect(musicIdentityIsRoutable(identity)).toBe(false);
      expect(musicEntityHref(identity)).toBeNull();
    }
  });

  it("preserves distinct opaque URLs when artists or songs have identical labels", () => {
    const first = firstClassMusicIdentity({
      kind: "song",
      publicEntityId: "song-1",
      label: "Same title",
    });
    const second = firstClassMusicIdentity({
      kind: "song",
      publicEntityId: "song-2",
      label: "Same title",
    });
    expect(musicEntityHref(first)).not.toBe(musicEntityHref(second));
  });

  it("rejects blank identity inputs", () => {
    expect(() =>
      entryBoundMusicIdentity({ kind: "song", entryId: " ", label: "Title" }),
    ).toThrow("Entry id is required");
    expect(() =>
      firstClassMusicIdentity({ kind: "artist", publicEntityId: " ", label: "Artist" }),
    ).toThrow("Public entity id is required");
    expect(() =>
      firstClassMusicIdentity({ kind: "artist", publicEntityId: "artist-1", label: " " }),
    ).toThrow("Music entity label is required");
  });
});
