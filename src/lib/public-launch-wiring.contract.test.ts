import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicLaunchAllows } from "./public-launch-availability";
const source = (path: string) => readFileSync(path, "utf8");
describe("soft-launch entry-point integration", () => {
  it("keeps one root presentation boundary around public route content and leaves maintenance/admin isolation", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain("isolatedRoute || fullAdmin");
    expect(root).toContain("<PublicLaunchRouteBoundary pathname={pathname}>");
    expect(root).toContain("<V3RootLegacyCutover>{content}</V3RootLegacyCutover>");
    expect(root).toContain('pathname === "/maintenance/recovery"');
  });
  it("filters catalog, installed and browser search results, recents and menus", () => {
    for (const path of [
      "src/components/public/PublicSectionNav.tsx",
      "src/components/public/PublicMobileSectionNav.tsx",
      "src/components/public/PublicSiteNavigation.tsx",
      "src/components/v3/V3DirectoryFamilyIndex.tsx",
      "src/routes/explore/index.tsx",
    ]) {
      expect(source(path)).toContain("usePublicLaunchAvailability");
      expect(source(path)).toContain("allows(item.to)");
    }
    const search = source("src/components/public/PublicCommandPalette.tsx");
    expect(
      search.match(/unfilteredSearchResults.filter\(item => allows\(item.href\)\)/g),
    ).toHaveLength(2);
    expect(search).toContain("if (!allows(item.href)) continue;");
  });
  it("uses caller-evaluated flags and the established account cache, without a local tester bypass or polling", () => {
    const provider = source("src/components/public/PublicLaunchAvailability.tsx");
    expect(provider).toContain("isStudio2FeatureEnabled(flag)");
    expect(provider).toContain('"studio2-public-launch", actor, session.dataUpdatedAt');
    expect(provider).toContain("flags.data?.actor === actor");
    expect(provider).toContain("session.isFetching");
    expect(provider).toContain("flags.isFetching");
    expect(provider).not.toContain("localStorage");
    expect(provider).not.toContain("refetchInterval");
    expect(provider).not.toContain("isOrganizer");
  });
  it("keeps every installed PWA shortcut on a core destination", () => {
    const manifest = JSON.parse(source("public/site.webmanifest"));
    for (const shortcut of manifest.shortcuts) expect(publicLaunchAllows(shortcut.url)).toBe(true);
  });
});
