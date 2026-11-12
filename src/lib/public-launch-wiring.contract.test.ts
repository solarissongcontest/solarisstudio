import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicLaunchAllows } from "./public-launch-availability";
const source = (path: string) => readFileSync(path, "utf8");
describe("soft-launch entry-point integration", () => {
  it("keeps one root presentation boundary around public route content and leaves maintenance/admin isolation", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain("isolatedRoute || fullAdmin");
    expect(root).toContain('enabled={!publicParticipation && !pathname.startsWith("/jury-voting") && pathname !== "/auth"}');
    expect(root).toContain("<PublicLaunchRouteBoundary pathname={pathname}>");
    expect(root).toContain("<V3RootLegacyCutover>{content}</V3RootLegacyCutover>");
    const gate = root.slice(
      root.indexOf("<PublicLaunchRouteBoundary pathname={pathname}>"),
      root.indexOf("</PublicLaunchRouteBoundary>"),
    );
    // A hidden route must also hide its floating quick-guide content.
    expect(gate).toContain("<ToolQuickGuide pathname={pathname} />");
    expect(root).not.toContain("{!isolatedRoute ? <ToolQuickGuide pathname={pathname} /> : null}");
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
    expect(source("src/components/app/AppExplorePersonalized.tsx")).toContain("allows(item.path)");
    const search = source("src/components/public/PublicCommandPalette.tsx");
    expect(
      search.match(/unfilteredSearchResults.filter\(item => allows\(item.href\)\)/g),
    ).toHaveLength(2);
    expect(search).toContain("if (!allows(item.href)) continue;");
  });
  it("keeps legacy Home, Results, Country and account navigation on the same typed link adapter", () => {
    for (const path of ["src/routes/index.tsx", "src/routes/results/index.tsx", "src/routes/countries/$code.tsx", "src/routes/countries/index.tsx", "src/routes/_authenticated/my-solaris/index.tsx", "src/components/country/ProfileActivityPanel.tsx", "src/components/mysolaris/MySolarisPersonalPage.tsx"]) {
      expect(source(path)).toContain("PublicLaunchLink as Link");
    }
    const adapter = source("src/components/public/PublicLaunchLink.tsx");
    expect(adapter).toContain("createLink(LaunchAnchor)");
    expect(adapter).toContain("allows(href)");
    expect(adapter).not.toContain("supabase");
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
