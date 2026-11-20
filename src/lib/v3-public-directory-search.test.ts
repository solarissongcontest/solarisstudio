import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchesPublicDirectorySearch,
  normalizePublicDirectorySearch,
  resolvePublicDirectoryFacet,
} from "./v3-public-directory-search";

describe("Explore cross-entity directory search", () => {
  it("matches each search term across the independent public country fields", () => {
    const country = ["Holy Impalist Republic of Oland", "OLA", "Ålanti", "North Hydra"];
    expect(matchesPublicDirectorySearch("Ålanti Hydra", country)).toBe(true);
    expect(matchesPublicDirectorySearch("ola north", country)).toBe(true);
    expect(matchesPublicDirectorySearch("hydra missing", country)).toBe(false);
    expect(matchesPublicDirectorySearch("  ", country)).toBe(true);
  });

  it("matches edition number, edition title, host and published winner together", () => {
    const edition = ["SSC 22", "ssc-22", 22, "Tetlehamn, Oland", "Aotea"];
    expect(matchesPublicDirectorySearch("22 aotea", edition)).toBe(true);
    expect(matchesPublicDirectorySearch("tetlehamn 22", edition)).toBe(true);
    expect(matchesPublicDirectorySearch("22 unknown", edition)).toBe(false);
    expect(matchesPublicDirectorySearch("aotea", [null, undefined, "Aotea"])).toBe(true);
  });

  it("allows typable transliterations while retaining canonical country names", () => {
    expect(normalizePublicDirectorySearch("Ørnådal")).toBe("ornadal");
    expect(normalizePublicDirectorySearch("Ålanti")).toBe("alanti");
    expect(normalizePublicDirectorySearch("Ægir, Łódź, Straße")).toBe("aegir, lodz, strasse");
    expect(matchesPublicDirectorySearch("ornadal", ["Ørnådal"])).toBe(true);
  });

  it("fails back to all regions when a permitted facet is revoked", () => {
    expect(resolvePublicDirectoryFacet("Hydra", ["Atlas", "Hydra"])).toBe("Hydra");
    expect(resolvePublicDirectoryFacet("Hydra", ["Atlas"])).toBe("all");
    expect(resolvePublicDirectoryFacet("Hydra", [])).toBe("all");
    expect(resolvePublicDirectoryFacet("all", [])).toBe("all");
  });

  it("uses the same normalized search across country and edition pages without a new data reader", () => {
    const countries = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
    const countryFilter = readFileSync("src/lib/v3-country-directory-filters.ts", "utf8");
    const editions = readFileSync("src/routes/editions/index.tsx", "utf8");
    expect(countryFilter).toContain("matchesPublicDirectorySearch(input.search");
    expect(editions).toContain("matchesPublicDirectorySearch(normalizedSearch");
    expect(countries).toContain("resolvePublicDirectoryFacet(region, regionOptions.map");
    expect(countries).toContain("region: effectiveRegion");
    expect(countries).toContain("value={effectiveRegion}");
    expect(countries).toContain('if (region !== effectiveRegion) setRegion("all")');
    expect(countryFilter).not.toContain("supabase");
    expect(editions).not.toContain('from "@/integrations/supabase/client"');
  });
});
