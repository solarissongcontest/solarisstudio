import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseShowDirectoryUrlSearch,
  parseCountryDirectoryUrlSearch,
} from "./v3-explore-browse-url";

describe("Explore published Show and Country URL search state", () => {
  it("retains valid published Show browse parameters without claiming publication", () => {
    expect(parseShowDirectoryUrlSearch({
      q: "  Northern   Final ", edition: "22aa-bb", kind: "grand-final", state: "ended",
    })).toEqual({ q: "Northern Final", edition: "22aa-bb", kind: "grand-final", state: "ended" });
  });

  it("bounds and rejects invalid Show facets and unrecognized states", () => {
    expect(parseShowDirectoryUrlSearch({
      q: ["not a string"], edition: "../private", kind: "a".repeat(81), state: "unpublished",
    })).toEqual({q: undefined, edition: undefined, kind: undefined, state: undefined});
    expect(parseShowDirectoryUrlSearch({edition: "all", kind: "all", state: "live"}))
      .toEqual({q: undefined, edition: undefined, kind: undefined, state: "live"});
  });

  it("allows human region names but does not make the URL a country authority", () => {
    expect(parseCountryDirectoryUrlSearch({q: "  Ålanti   Oland ", region: "North  Hydra", scope: "participants"}))
      .toEqual({q: "Ålanti Oland", region: "North Hydra", scope: "participants"});
    expect(parseCountryDirectoryUrlSearch({q: 12, region: "x".repeat(200), scope: "secret"}))
      .toEqual({q: undefined, region: undefined, scope: undefined});
  });

  it("keeps Shows search in the public route and publication-filtered component", () => {
    const route = readFileSync("src/routes/shows/index.tsx", "utf8");
    const view = readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx", "utf8");
    expect(route).toContain("validateSearch: parseShowDirectoryUrlSearch");
    expect(route).toContain("Route.useSearch()");
    expect(route).toContain("Route.useNavigate()");
    expect(view).toContain("buildShowDiscovery({");
    expect(view).toContain("resolveShowDirectoryFacet(editionId");
    expect(view).toContain("browseFilterKey = JSON.stringify([normalizedSearch, effectiveEditionId, effectiveKind, state])");
    expect(view).toContain("onUrlSearchChange(next)");
    expect(view).toContain("replace: true");
    expect(view).not.toContain("useAllResults(");
    expect(view).not.toContain("useAllJuryVotes(");
  });
});
