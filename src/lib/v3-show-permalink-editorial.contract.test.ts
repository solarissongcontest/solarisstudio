import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseShowDirectoryUrlSearch } from "./v3-explore-browse-url";
import { matchesShowDirectorySearch, resolveShowDirectoryFacet } from "./v3-shows-directory-filters";

describe("V3 Shows permalink + curated editorial reconciliation", () => {
  it("normalizes valid public search and show facets without granting visibility", () => {
    expect(parseShowDirectoryUrlSearch({
      q: "  SSC   Grand   Final ",
      edition: "edition-22", kind: "grand-final", state: "ended",
    })).toEqual({
      q: "SSC Grand Final", edition: "edition-22", kind: "grand-final", state: "ended",
    });
    expect(parseShowDirectoryUrlSearch({
      q: ["private"], edition: "../admin", kind: "a".repeat(81), state: "unpublished",
    })).toEqual({ q: undefined, edition: undefined, kind: undefined, state: undefined });
    expect(parseShowDirectoryUrlSearch({ edition: "all", kind: "all", state: "live" }))
      .toEqual({ q: undefined, edition: undefined, kind: undefined, state: "live" });
  });

  it("matches published fields and resets a facet absent from verified public options", () => {
    expect(matchesShowDirectorySearch("ornadal grand", ["Ørnådal", "Grand Final"])).toBe(true);
    expect(matchesShowDirectorySearch("ssc final", ["SSC 22", "Northern Final"])).toBe(true);
    expect(matchesShowDirectorySearch("private", ["SSC 22", "Northern Final"])).toBe(false);
    expect(resolveShowDirectoryFacet("edition-22", ["edition-22", "edition-21"])).toBe("edition-22");
    expect(resolveShowDirectoryFacet("edition-20", ["edition-22"])).toBe("all");
  });

  it("keeps the #2602 curated experience and #2593 safe URL/history wiring", () => {
    const route = readFileSync("src/routes/shows/index.tsx", "utf8");
    const screen = readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx", "utf8");
    expect(route).toContain("validateSearch: parseShowDirectoryUrlSearch");
    expect(route).toContain("Route.useSearch()");
    expect(route).toContain("Route.useNavigate()");
    expect(route).toContain("replace: true");
    expect(screen).toContain("buildShowSpotlights(");
    expect(screen).toContain("v3-editorial-show-index");
    expect(screen).toContain("v3-shows-web-filters-summary");
    expect(screen).toContain("publicSourcesReady");
    expect(screen).toContain("resolveShowDirectoryFacet(editionId");
    expect(screen).toContain("browseFilterKey = JSON.stringify([normalizedSearch, effectiveEditionId, effectiveKind, state])");
    expect(screen).toContain("onUrlSearchChange(next)");
    expect(screen).toContain('allowsReleased("/editions")');
    expect(screen).toContain("publicBroadcastHref(item.broadcastUrl)");
    expect(screen).not.toContain("href={item.broadcastUrl}");
    expect(screen).not.toContain("useAllResults(");
    expect(screen).not.toContain("useAllJuryVotes(");
  });
});
