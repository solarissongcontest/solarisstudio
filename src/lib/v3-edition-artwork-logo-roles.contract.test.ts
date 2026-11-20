import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildV3ExploreRootProjection, type V3ExploreRootInput } from "./v3-explore";
const editionSource = readFileSync("src/integrations/v3/edition-source.server.ts", "utf8");
const exploreSource = readFileSync("src/integrations/v3/explore-source.server.ts", "utf8");
const overview = readFileSync("src/components/v3/V3EditionOverviewScreen.tsx", "utf8");
const screen = readFileSync("src/components/v3/V3ExploreScreen.tsx", "utf8");

describe("V3 Edition's independent artwork and logo roles", () => {
  it("never stretches the Edition logo as a default hero photograph", () => {
    for (const code of [editionSource, exploreSource]) {
      expect(code).toContain("artworkUrl: edition.artwork_url ?? null");
      expect(code).toContain("logoUrl: edition.logo ?? null");
      expect(code).not.toContain("edition.artwork_url ?? edition.logo");
    }
    expect(overview).toContain("className=\"cinematic-edition-logo\"");
    expect(overview).toContain('imageUrl={spoilerSafe ? null : projection.hub.hero.artworkUrl}');
    expect(screen).toContain("!visibleArtwork && visibleLogo");
    expect(screen).toContain("edition.artworkUrl && edition.artworkUrl !== failedArtwork");
    expect(screen).toContain("edition.logoUrl && edition.logoUrl !== failedLogo");
    expect(screen).toContain("onError={() => setFailedArtwork(visibleArtwork)}");
    expect(screen).toContain("onError={() => setFailedLogo(visibleLogo)}");
  });
  it("passes both published roles through the canonical Explore projection", () => {
    const input = {
      currentEditionId: "e", countries: [], songs: [], artists: [], shows: [], stories: [],
      editions: [{ id:"e",slug:"ssc-e",name:"SSC e",editionNumber:1,year:2026,
        hostLabel:"Host",artworkUrl:null,logoUrl:"/logos/e.webp",visibility:"public",
        experience:"upcoming",resultsPublication:"hidden",href:"/editions/ssc-e",archiveEligible:false }],
      routes: {
        countries:"/countries", songsAndArtists:"/editions", shows:"/shows",stories:"/stories",
        results:"/results",rules:"/rules",editionsArchive:"/editions",wiki:"/wiki",encyclopedia:"/encyclopedia"
      }
    } satisfies V3ExploreRootInput;
    expect(buildV3ExploreRootProjection(input).currentEdition?.artworkUrl).toBeNull();
    expect(buildV3ExploreRootProjection(input).currentEdition?.logoUrl).toBe("/logos/e.webp");
  });
});
