import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchesShowDirectorySearch,
  resolveShowDirectoryFacet,
} from "./v3-shows-directory-filters";

const shows = readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx", "utf8");

describe("Explore Shows public browse search and live facets", () => {
  it("matches several words across show, edition, type and state fields", () => {
    const fields = ["Northern Final", "SSC 22", "Grand Final", "Scheduled"];
    expect(matchesShowDirectorySearch("   SSC     Final ", fields)).toBe(true);
    expect(matchesShowDirectorySearch("scheduled northern", fields)).toBe(true);
    expect(matchesShowDirectorySearch("GRAND    22", fields)).toBe(true);
    expect(matchesShowDirectorySearch("ssc semi", fields)).toBe(false);
    expect(matchesShowDirectorySearch("  ", fields)).toBe(true);
    expect(matchesShowDirectorySearch("ålanti finaL", ["SSC 22 · Ålanti", "Grand Final"])).toBe(true);
    expect(matchesShowDirectorySearch("Ornadal ended", ["Ørnådal", "Ended"])).toBe(true);
  });

  it("recovers a revoked or renamed selection rather than silently filtering everything", () => {
    const current = ["edition-22", "edition-21"];
    expect(resolveShowDirectoryFacet("edition-22", current)).toBe("edition-22");
    expect(resolveShowDirectoryFacet("all", current)).toBe("all");
    expect(resolveShowDirectoryFacet("unpublished-edition", current)).toBe("all");
    expect(resolveShowDirectoryFacet("final", [])).toBe("all");
  });

  it("uses the exact effective filters for controls and displayed shows", () => {
    expect(shows).toContain("matchesShowDirectorySearch(normalizedSearch");
    expect(shows).toContain("effectiveEditionId === \"all\"");
    expect(shows).toContain("effectiveKind === \"all\"");
    expect(shows).toContain("value: effectiveEditionId");
    expect(shows).toContain("value: effectiveKind");
    expect(shows).toContain("browseFilterKey = JSON.stringify([normalizedSearch, effectiveEditionId, effectiveKind, state])");
    expect(shows).toContain('allowsReleased("/editions")');
    expect(shows).toContain("getV3ShowBrowsePage(");
  });

  it("does not turn a public filter into a second publication or broadcast authority", () => {
    expect(shows).toContain("buildShowDiscovery({");
    expect(shows).toContain("showPublishesResults(item.show)");
    expect(shows).not.toContain('from "@/integrations/supabase/client"');
    expect(shows).not.toContain("useAllJuryVotes(");
  });
});
