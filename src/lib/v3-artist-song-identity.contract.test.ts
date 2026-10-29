import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P9 Artist/Song identity contract", () => {
  it("never derives first-class routes from display names", () => {
    const identity = source("src/lib/v3-artist-song-identity.ts");

    expect(identity).not.toContain("slugify");
    expect(identity).not.toContain("toLowerCase()");
    expect(identity).not.toContain("normalize(");
    expect(identity).toContain('identity: "entry_reference"');
    expect(identity).toContain("href: null");
    expect(identity).toContain("encodeURIComponent(publicEntityId)");
  });

  it("routes Explore music discovery to its dedicated product instead of Edition Overview", () => {
    const explore = source("src/integrations/v3/explore-source.server.ts");

    expect(explore).toContain('songsAndArtists: "/music"');
    expect(explore).not.toContain(
      'songsAndArtists: currentEdition ? `/editions/${currentEdition.slug}` : "/editions"',
    );
  });

  it("documents the current authority as Entry-scoped text rather than first-class Artist/Song identity", () => {
    const contract = source("docs/architecture/v3-public-p9-artist-song-identity-contract.md");

    expect(contract).toContain("no `public` or `private` tables or functions whose names contain `artist` or `song`");
    expect(contract).toContain("`entries.artist`");
    expect(contract).toContain("`entries.song_title`");
    expect(contract).toContain("`edition_participations.artist`");
    expect(contract).toContain("An Entry UUID may anchor catalogue evidence");
  });

  it("requires server-authoritative publication safety for direct entity and discovery surfaces", () => {
    const contract = source("docs/architecture/v3-public-p9-artist-song-identity-contract.md");

    expect(contract).toContain("future scheduled publication uses server time");
    expect(contract).toContain("Organizer capabilities do not widen public visibility");
    expect(contract).toContain("Search, HTML, Open Graph, sitemap and preload");
    expect(contract).toContain("fail closed");
  });

  it("pins P9 as System-identity blocked until durable opaque ids and projections exist", () => {
    const contract = source("docs/architecture/v3-public-p9-artist-song-identity-contract.md");

    expect(contract).toContain("Status: **foundation / System identity blocked**");
    expect(contract).toContain("opaque stable artist id independent of display name");
    expect(contract).toContain("opaque stable song id independent of title");
    expect(contract).toContain("P9 remains **foundation / System identity blocked**");
  });
});
