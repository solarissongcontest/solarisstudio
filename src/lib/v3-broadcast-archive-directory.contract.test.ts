import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(file, "utf8");

describe("V3 broadcast and historical directories: three experiences", () => {
  it("keeps Shows state-led with one discovery projection and three distinct compositions", () => {
    const route = source("src/routes/shows/index.tsx");
    const screen = source("src/components/v3/V3ShowsDiscoveryScreen.tsx");
    expect(route).toContain("useV3DirectoryPresentation()");
    expect(route).toContain("platformResolved");
    expect(route).toContain('data-directory-mobile-header=""');
    expect(route).toContain("data-directory-experience={presentation}");
    expect(screen).toContain('data-show-directory-experience={presentation}');
    expect(screen).toContain("buildShowDiscovery");
    expect(screen).toContain("ShowWebRow");
    expect(screen).toContain("v3-shows-filter-fields");
    expect(screen).toContain("v3-shows-browse-results");
    expect(screen).toContain('eyebrow="Live now"');
    expect(screen).toContain('eyebrow="Up next"');
    expect(screen).toContain('eyebrow="Recent"');
    expect(screen).toContain('eyebrow="Archive"');
    expect(screen).toContain("showPublishesResults(item.show)");
    expect(screen).toContain("item.broadcastUrl");
    expect(screen).not.toContain("useAllResults");
  });

  it("retains exactly the six published Archive destinations, without current tasks", () => {
    const root = source("src/routes/archive/index.tsx");
    for (const route of ["/countries", "/editions", "/shows", "/stories", "/encyclopedia", "/archive-games"]) {
      expect(root).toContain(`to: "${route}"`);
    }
    expect(root).toContain("Historical context stays historical");
    expect(root).toContain("Current participation responsibilities belong in Participate");
    expect(root).not.toContain('to: "/participate"');
    expect(root).not.toContain("useCountries(");
    expect(root).not.toContain("useEditions(");
    expect(root).not.toContain("supabase");
  });

  it("gives Archive app sheet, phone-web list and desktop navigation rail", () => {
    const root = source("src/routes/archive/index.tsx");
    expect(root).toContain("useV3DirectoryPresentation()");
    expect(root).toContain("platformResolved");
    expect(root).toContain('data-directory-experience={presentation}');
    expect(root).toContain('data-directory-mobile-header=""');
    expect(root).toContain("<AppGroupedList>");
    expect(root).toContain("v3-directory-mobile-list");
    expect(root).toContain("v3-directory-desktop-rail");
    expect(root).toContain("v3-directory-desktop-grid");
    expect(root).toContain('aria-label="Filter archive by subject"');
    expect(root).toContain("No archive topics found");
  });
});
