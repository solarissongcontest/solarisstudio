import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterSiteDirectory,
  siteDirectoryAreaCounts,
  siteDirectoryDestinations,
} from "./v3-site-directory";
import { resolveCountryDirectoryPresentation } from "./country-directory-presentation";

describe("V3 public directory family", () => {
  it("shares runtime-owned app identity, independent of viewport", () => {
    expect(resolveCountryDirectoryPresentation(true, true)).toBe("installed-app");
    expect(resolveCountryDirectoryPresentation(true, false)).toBe("installed-app");
    expect(resolveCountryDirectoryPresentation(false, true)).toBe("mobile-web");
    expect(resolveCountryDirectoryPresentation(false, false)).toBe("desktop-web");
  });

  it("uses the canonical discoverable destinations, including advanced and signed-in links", () => {
    const items = siteDirectoryDestinations();
    expect(items.length).toBeGreaterThan(20);
    expect(items.every((item) => item.discoverable !== false)).toBe(true);
    expect(items.some((item) => item.auth === "signed-in")).toBe(true);
    expect(items.some((item) => item.visibility === "advanced")).toBe(true);
    expect(items.some((item) => item.to === "/countries")).toBe(true);
  });

  it("keeps search, scope and per-area counts identical for every presentation", () => {
    const items = siteDirectoryDestinations();
    const counts = siteDirectoryAreaCounts(items);
    expect(counts.reduce((count, area) => count + area.count, 0)).toBe(items.length);
    expect(filterSiteDirectory(items, "  VoTe  ").length).toBeGreaterThan(0);
    expect(filterSiteDirectory(items, "VOTE", "explore")).toEqual(
      filterSiteDirectory(items, "vote").filter((item) => item.area === "explore"),
    );
    expect(filterSiteDirectory(items, "", "all")).toEqual(items);
    expect(filterSiteDirectory(items, "no-such-solaris-navigation-destination")).toEqual([]);
  });

  it("maintains three distinct usable presentations without duplicating domain data", () => {
    const route = readFileSync("src/routes/site-directory/index.tsx", "utf8");
    const styles = readFileSync("src/styles/v3-directory-family.css", "utf8");
    expect(route).toContain('data-directory-experience={presentation}');
    expect(route).toContain('data-directory-mobile-header=""');
    expect(route).toContain("v3-directory-desktop-rail");
    expect(route).toContain("v3-directory-mobile-list");
    expect(route).toContain("<AppGroupedList>");
    expect(route).toContain("filterSiteDirectory");
    expect(route).toContain("siteDirectoryDestinations");
    expect(route).toContain("platformResolved");
    expect(route).toContain("aria-pressed={area === item.area}");
    expect(styles).toContain('[data-directory-experience="desktop-web"]');
    expect(styles).toContain('[data-directory-experience="mobile-web"]');
    expect(styles).toContain('[data-directory-experience="installed-app"]');
    expect(styles).not.toContain(":root {");
    expect(route).not.toContain("supabase");
  });
});
