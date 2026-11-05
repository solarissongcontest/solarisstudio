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
    expect(route).not.toContain('className="v3-directory-back"');
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
    expect(root).toContain('className="v3-archive-context mb-4 border-b');
    expect(root).not.toContain('rounded-2xl border border-border bg-surface/55');
    expect(root).toContain("Current participation responsibilities belong in Participate");
    expect(root).not.toContain('to: "/participate"');
    expect(root).not.toContain("useCountries(");
    expect(root).not.toContain("useEditions(");
    expect(root).not.toContain("supabase");
  });

  it("gives Archive app sheet, phone-web list and desktop navigation rail", () => {
    const root = source("src/routes/archive/index.tsx");
    const family = source("src/components/v3/V3DirectoryFamilyIndex.tsx");
    expect(root).toContain("V3DirectoryFamilyIndex");
    expect(root).toContain("context={<ArchiveContext />}");
    expect(root).toContain('searchLabel="Search archive"');
    expect(root).toContain('itemNoun="archive topics"');
    expect(family).toContain("useV3DirectoryPresentation()");
    expect(family).toContain("platformResolved");
    expect(family).toContain('data-directory-experience={presentation}');
    expect(family).toContain('data-directory-mobile-header=""');
    expect(family).toContain("<AppGroupedList>");
    expect(family).toContain("v3-directory-mobile-list");
    expect(family).toContain("v3-directory-desktop-rail");
    expect(family).toContain("v3-directory-desktop-grid");
    expect(family).toContain("No matching");
  });
});
