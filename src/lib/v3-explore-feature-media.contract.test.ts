import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const feature = readFileSync("src/components/v3/V3ExploreScreen.tsx", "utf8");
const css = readFileSync("src/styles/v3-explore-editorial.css", "utf8");
const source = readFileSync("src/lib/v3-explore.ts", "utf8");

describe("Explore current edition media stays publication-safe and resilient", () => {
  it("keeps official artwork distinct from a bounded logo", () => {
    expect(source).toContain("logoUrl?: string | null");
    expect(source).toContain("artworkUrl: string | null");
    expect(feature).toContain("data-has-artwork={visibleArtwork ?");
    expect(feature).toContain("!visibleArtwork && visibleLogo");
    expect(feature).not.toContain("artworkUrl ?? edition.logoUrl");
    expect(css).toContain(".v3-explore-feature__fallback");
    expect(css).toContain(".v3-explore-feature__logo");
  });

  it("hides broken artwork and broken logo URLs without changing edition truth", () => {
    expect(feature).toContain("edition.artworkUrl !== failedArtwork");
    expect(feature).toContain("edition.logoUrl !== failedLogo");
    expect(feature).toContain("onError={() => setFailedArtwork(visibleArtwork)}");
    expect(feature).toContain("onError={() => setFailedLogo(visibleLogo)}");
    expect(feature).toContain('data-has-artwork={visibleArtwork ? "true" : "false"}');
  });
});
