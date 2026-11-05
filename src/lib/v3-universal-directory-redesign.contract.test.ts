import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Solaris universal directory presentation regression", () => {
  const family = read("src/components/v3/V3DirectoryFamilyIndex.tsx");
  const familyCss = read("src/styles/v3-directory-family.css");
  const countries = read("src/components/v3/V3CountriesDiscoveryScreen.tsx");
  const countryCss = read("src/styles/v3-countries-discovery.css");
  const editions = read("src/routes/editions/index.tsx");
  const tools = read("src/routes/tools/index.tsx");
  const sitemap = read("src/routes/site-directory/index.tsx");

  it("reuses one runtime-owned directory search across app, mobile web and desktop", () => {
    expect(family).toContain("export function V3DirectorySearch");
    expect(family).toContain('presentation === "installed-app"');
    expect(family).toContain("SolarisSearchField");
    expect(family).toContain('type="search"');
    expect(family).toContain('aria-label="Clear search"');
    expect(editions).toContain("V3DirectorySearch");
    expect(editions).not.toContain("SolarisSearchField");
    expect(family).toContain('data-directory-experience={presentation}');
    expect(editions).toContain('data-directory-experience={presentation}');
  });

  it("does not hide selected collection scope behind faint color alone", () => {
    expect(countries).toContain("aria-pressed={participatingOnly}");
    expect(countries).toContain("aria-pressed={!participatingOnly}");
    expect(countries).toContain("participatingOnly ? <Check");
    expect(countries).toContain("!participatingOnly ? <Check");
    expect(countryCss).toContain('.v3-countries-scope-button[aria-pressed="true"]');
    expect(countryCss).toContain("box-shadow:inset 0 -3px 0 var(--primary)");
    expect(countries).toContain("Showing {visible.length} of {filtered.length} matches");
    expect(countries).toContain("{collectionCount}");
    expect(countries).toContain("filtered.slice(0, visibleCount)");
  });

  it("distinguishes available, matching and rendered directory items", () => {
    expect(family).toContain("const available = groups.reduce");
    expect(family).toContain("const visible = scoped.reduce");
    expect(family).toContain("Showing {visible} of {available}");
    expect(family).toContain("aria-pressed={area === option.id}");
    expect(family).toContain("aria-label={`Filter ${itemNoun} by category`}");
    expect(family).toContain("v3-directory-option-name");
    expect(familyCss).toContain("v3-directory-search-clear");
    expect(editions).toContain("Showing {visible.length} of {cards.length} published editions");
  });

  it("makes Tools an action directory without turning Site Directory into a copy", () => {
    expect(tools).toContain('variant="actions"');
    expect(sitemap).not.toContain('variant="actions"');
    expect(family).toContain('variant === "actions"');
    expect(family).toContain("v3-directory-action-list");
    expect(family).toContain("v3-directory-action-icon");
    expect(family).not.toContain('eyebrow="Browse"');
    expect(familyCss).toContain('[data-directory-variant="actions"]');
    expect(familyCss).toContain("border-bottom:1px solid var(--border)");
  });

  it("keeps the published, domain-specific Editions chronology and canonical links", () => {
    expect(editions).toContain("filter((edition) => edition.published)");
    expect(editions).toContain("isShowPublic(show)");
    expect(editions).toContain("resolveShowPublication(grandFinal)");
    expect(editions).toContain("publication?.results");
    expect(editions).toContain("EditionMobileRow");
    expect(editions).toContain("EditionDesktopCard");
    expect(editions).toContain('to="/editions/$slug"');
    expect(editions).toContain("AppGroupedList");
    expect(editions).not.toContain("In progress");
    expect(editions).not.toContain("supabase");
  });

  it("preserves composed Rulebook shell ownership and stable typed chapter routes", () => {
    expect(family).toContain("noShell = false");
    expect(family).toContain("context?: ReactNode");
    expect(family).toContain("params?: Record<string, string>");
    expect(family).toContain("return noShell ? content : <AppShell>{content}</AppShell>");
    expect(family).toContain("params={item.params as any}");
  });

  it("keeps all three experiences while avoiding dock and backend rewrites", () => {
    expect(family).toContain('presentation === "mobile-web"');
    expect(family).toContain('presentation === "desktop-web"');
    expect(family).toContain('presentation === "installed-app"');
    expect(countryCss).not.toContain(".solaris-app-tabbar");
    expect(familyCss).not.toContain(".solaris-app-tabbar");
    expect(family).not.toContain("supabase");
  });
});
