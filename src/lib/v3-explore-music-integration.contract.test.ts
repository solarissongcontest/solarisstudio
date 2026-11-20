import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Explore P9 music-first routing integration", () => {
  it("links the server-owned installed Explore projection to a dedicated catalogue", () => {
    const explore = source("src/integrations/v3/explore-source.server.ts");
    const screen = source("src/components/v3/V3ExploreScreen.tsx");
    expect(explore).toContain('songsAndArtists: "/music"');
    expect(explore).not.toContain('songsAndArtists: currentEdition ?');
    expect(screen).toContain('collection.key === "songs-and-artists" ? "Published catalogue"');
    expect(screen).not.toContain('Published song and artist labels in their Entry and Edition context');
  });

  it("keeps ordinary website Explore discovery navigable without lifting publication gates", () => {
    const web = source("src/routes/explore/index.tsx");
    const policy = source("src/lib/public-launch-availability.ts");
    expect(web).toContain('to: "/music"');
    expect(web).toContain('allowsReleased(item.to)');
    expect(policy).toContain("export const LIMITED_PUBLIC_LAUNCH = true");
    expect(policy).not.toContain('"/music",');
    const directory = source("src/lib/public-navigation.ts");
    expect(directory).toContain('destination("music", "/music", "explore"');
    expect(directory).toContain('destination("songs", "/songs", "explore"');
    expect(directory).toContain('destination("artists", "/artists", "explore"');
    // Search palette must also apply release availability to navigation results.
    expect(source("src/components/public/PublicCommandPalette.tsx")).toContain("unfilteredSearchResults.filter(item => allows(item.href))");

  });

  it("requires durable opaque P9 IDs and independently publication-safe readers", () => {
    const migration = source("supabase/migrations/20261024172500_v3_p9_music_identity_foundation.sql");
    const server = source("src/integrations/v3/music-entities-source.server.ts");
    const artistRoute = source("src/routes/artists/$artistId.tsx");
    const songRoute = source("src/routes/songs/$songId.tsx");
    expect(migration).toContain("private.v3_music_artists");
    expect(migration).toContain("private.v3_music_songs");
    expect(server).toContain("v3_public_artists");
    expect(server).toContain("v3_public_songs");
    expect(artistRoute).toContain("artistId");
    expect(songRoute).toContain("songId");
    expect(server).not.toContain('.from("entries")');
    const s15 = source("src/lib/v3-system-zero-orphan-registry.ts");
    expect(s15).toContain('path: "src/integrations/v3/music-entities-source.server.ts", coordinatorDomain: "entry"');
    const evidence = source("src/lib/v3-public-directory-evidence.ts");
    expect(evidence).toContain('id: "music", route: "/music", capabilityId: "p9-music-catalogue"');

    const capabilities = source("src/lib/v3-public-capability-supplements.ts");
    expect(capabilities).toContain('id: "p9-music-catalogue"');
    for (const root of ["/music", "/songs", "/artists"]) expect(capabilities).toContain(root);

  });
});
