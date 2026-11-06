import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterCountryDirectory } from "./v3-country-directory-filters";

const route = readFileSync("src/routes/wiki/index.tsx", "utf8");

describe("Legacy Wiki directory fallback", () => {
  it("shares canonical country search semantics across the installed and web fallbacks", () => {
    expect(route.match(/filterCountryDirectory\(countries \?\? \[\]/g)?.length).toBe(2);
    expect(route.match(/countryDirectoryRegionOptions\(countries \?\? \[\]/g)?.length).toBe(2);
    expect(route).toContain("participatingOnly: false");
    expect(route).not.toContain("country.name.toLowerCase().includes(query)");
    const records = [
      { id: "oland", name: "Oland", native_name: "Ålanti", short_code: "OLA", region: "Hydra" },
      { id: "ornadal", name: "Ørnådal", short_code: "ORN", region: null },
    ];
    const filtered = filterCountryDirectory(records, {
      search: "ornadal", region: "all", participatingOnly: false, participatingCountryIds: new Set(),
    });
    expect(filtered.map((row) => row.id)).toEqual(["ornadal"]);
    expect(filterCountryDirectory(records, {
      search: "alanti", region: "Hydra", participatingOnly: false, participatingCountryIds: new Set(),
    }).map((row) => row.id)).toEqual(["oland"]);
  });

  it("supports empty-state recovery instead of leaving both directories stranded", () => {
    expect(route.match(/Clear Wiki filters/g)?.length).toBe(2);
    expect(route).toContain('setSearch(""); setRegion("all");');
    expect(route).toContain('setLetter("all"); setVisibleCount(DIRECTORY_PAGE_SIZE)');
    expect(route).toContain("No published Wiki countries are available.");
    expect(route).toContain("No Wiki article matches those filters.");
  });

  it("preserves rollout-controlled canonical Reference convergence and deep links", () => {
    expect(route).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(route).toContain("enabled: platformResolved");
    expect(route).toContain('<Navigate to="/encyclopedia" search={{ artist: undefined }} replace />');
    expect(route).toContain('to="/wiki/$code"');
    expect(route).toContain("return isAppMode ? <AppWikiIndexPage /> : <WebWikiIndexPage />");
  });
});
