import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveCountryDirectoryPresentation } from "./country-directory-presentation";

const source = (path: string) => readFileSync(path, "utf8");

describe("Countries directory three deliberate experiences", () => {
  it("does not infer installed-app identity from screen width", () => {
    expect(resolveCountryDirectoryPresentation(true, true)).toBe("installed-app");
    expect(resolveCountryDirectoryPresentation(true, false)).toBe("installed-app");
    expect(resolveCountryDirectoryPresentation(false, true)).toBe("mobile-web");
    expect(resolveCountryDirectoryPresentation(false, false)).toBe("desktop-web");
  });

  it("keeps one canonical browse model with three distinct presentations", () => {
    const route = source("src/routes/countries/index.tsx");
    const screen = source("src/components/v3/V3CountriesDiscoveryScreen.tsx");
    expect(route).toContain('presentation="installed-app"');
    expect(route).toContain("presentation={presentation}");
    expect(route).toContain('data-country-directory-web-header=""');
    expect(screen).toContain("buildCountryDiscovery({");
    expect(screen).toContain("filterCountryDirectory(countriesQuery.data ?? []");
    expect(screen).toContain("data-country-directory-experience={presentation}");
    expect(screen).toContain('presentation === "mobile-web"');
    expect(screen).toContain('presentation === "desktop-web"');
    expect(screen).toContain("v3-countries-region-rail");
    expect(screen).toContain("v3-countries-web-list");
    expect(screen).toContain("v3-countries-desktop-grid");
    expect(screen).toContain("useState(false)");
    expect(screen).toContain("FlagFrame");
    expect(screen).toContain('to="/countries/$code"');
    expect(screen).not.toContain("useAllResults");
  });

  it("supports keyboard navigation, filtered counts and bounded results", () => {
    const screen = source("src/components/v3/V3CountriesDiscoveryScreen.tsx");
    const css = source("src/styles/v3-countries-discovery.css");
    expect(screen).toContain('aria-label="Countries"');
    expect(screen).toContain('aria-label="Filter by region"');
    expect(screen).toContain('aria-pressed={participatingOnly}');
    expect(screen).toContain("setVisibleCount((count) => count + BROWSE_PAGE_SIZE)");
    expect(css).toContain('[data-country-directory-experience="mobile-web"]');
    expect(css).toContain('[data-country-directory-experience="desktop-web"]');
    expect(css).not.toContain(":root {");
  });
});
