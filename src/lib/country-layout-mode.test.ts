import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCountryDirectoryPresentation } from "./country-directory-presentation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country page presentation ownership", () => {
  it("keeps three products distinct even at the same phone width", () => {
    expect(resolveCountryDirectoryPresentation(false, true)).toBe("mobile-web");
    expect(resolveCountryDirectoryPresentation(false, false)).toBe("desktop-web");
    expect(resolveCountryDirectoryPresentation(true, true)).toBe("installed-app");
    expect(resolveCountryDirectoryPresentation(true, false)).toBe("installed-app");
  });

  it("keeps the installed-app route gated and the browser route separate", () => {
    const gate = read("src/components/v3/V3DelegationRouteGate.tsx");
    const route = read("src/routes/countries/$code.tsx");
    expect(gate).toContain('if (!isAppMode) return <>{legacy}</>');
    expect(gate).toContain("<V3DelegationScreen");
    expect(route).toContain("const countryLayoutMode = useCountryDirectoryPresentation()");
    expect(route).toContain("const code = params.code.toUpperCase();");
    expect(route).toContain("encodeURIComponent(code)");
    expect(route).not.toContain("encodeURIComponent(params.code)");
    expect(route).toContain('publishedDesign && countryLayoutMode !== "mobile-web"');
    expect(route).toContain('countryLayoutMode === "mobile-web" ? (');
    expect(route).toContain("<CountryMobileWebMasthead");
    expect(route).toContain('data-country-layout-mode={countryLayoutMode}');
    expect(route).toContain("<ResponsiveTabs");
    expect(route).toContain("<CountryDesignV2Hero");
    expect(route).toContain("<CountryIdentityHero");
    // When Reference is published, /wiki/$code redirects to /countries/$code.
    // Country links must open the index, not navigate back to themselves.
    expect(route.split('<Link to="/wiki">Reference</Link>')).toHaveLength(3);
    expect(route).toContain('wiki: { label: "Reference", href: "/wiki" }');
    expect(route).not.toContain('to="/wiki/$code"');
  });

  it("shares runtime-first layout selection with Wiki while keeping its browser article intact", () => {
    const hook = read("src/lib/use-country-directory-presentation.ts");
    const wiki = read("src/components/wiki/CountryWikiExperience.tsx");
    const css = read("src/wiki-mobile-web.css");

    expect(hook).toContain("useSolarisApp()");
    expect(hook).toContain("useSyncExternalStore(");
    expect(hook).toContain("COUNTRY_DIRECTORY_MOBILE_MEDIA");
    expect(hook).toContain("resolveCountryDirectoryPresentation(isAppMode, narrow)");
    expect(wiki).toContain("const countryLayoutMode = useCountryDirectoryPresentation()");
    expect(wiki).toContain("data-wiki-layout-mode={countryLayoutMode}");
    expect(wiki).toContain('countryLayoutMode === "mobile-web" ? (');
    expect(wiki).toContain('<CountryWikiHeader country={country} layoutMode={countryLayoutMode} />');
    expect(wiki).toContain("wiki-mobile-web-toc");
    expect(wiki).toContain("<WikiMobileToolbar");
    expect(wiki).toContain("<WikiInfobox");
    expect(wiki).toContain('layoutMode === "mobile-web"');
    expect(wiki).toContain("aspect-[3/2]");
    expect(css).toContain('[data-wiki-layout-mode="mobile-web"]');
    const legacyWiki = read("src/wiki-mobile-encyclopedia.css");
    const legacyPersonalitySelectors = [
      ...legacyWiki.matchAll(
        /body\[data-entity-theme="country"\]\[data-country-hero-layout(?:="[^"]+")?\]\s+\.wiki-canvas(?::not\(\[data-wiki-layout-mode="mobile-web"\]\))?/g,
      ),
    ];
    expect(legacyPersonalitySelectors.length).toBeGreaterThan(10);
    expect(
      legacyPersonalitySelectors.every(([selector]) =>
        selector.includes(':not([data-wiki-layout-mode="mobile-web"])'),
      ),
    ).toBe(true);
    expect(css).toContain('.wiki-canvas[data-wiki-layout-mode="mobile-web"] .wiki-article-section');
    expect(css).toContain("font-size: 1rem !important;");
    expect(css).not.toContain(":root {");
  });

  it("shows the same current published participation in mobile-browser and desktop Country identity", () => {
    const route = read("src/routes/countries/$code.tsx");
    const masthead = read("src/components/country/CountryMobileWebMasthead.tsx");
    expect(route).toContain("resolveCountryCurrentContext(");
    expect(route).toContain("buildCountryDiscovery({");
    expect(route).toContain("currentParticipants: publicArchive.participants");
    expect(route).toContain("archiveHasError(editionsQuery, showsQuery, participantsQuery)");
    expect(route).toContain("currentContext={currentContext}");
    expect(route).toContain("isPublishedCurrentCountryEntry(");
    expect(route).toContain('title={latestEntryIsCurrent ? "Current published entry" : "Latest published entry"}');
    expect(route).toContain("currentContextError");
    expect(route).toContain("currentContextLoading");
    expect(route).toContain('countryLayoutMode !== "mobile-web" ? (');
    expect(route).toContain('aria-label="Current-edition participation"');
    expect(masthead).toContain("currentContext: CountryCurrentContext");
    expect(masthead).toContain('aria-label="Current-edition participation"');
    expect(masthead).toContain("{currentContext.status}");
    expect(route).not.toContain("countriesQuery.data?.length || 67");
  });

  it("loads scoped mobile-web styling as route CSS rather than repeated JavaScript style strings", () => {
    const country = read("src/routes/countries/$code.tsx");
    const wiki = read("src/components/wiki/CountryWikiExperience.tsx");
    expect(country).toContain('import "@/country-mobile-web.css";');
    expect(wiki).toContain('import "@/wiki-mobile-web.css";');
    expect(country).not.toContain('country-mobile-web.css?inline');
    expect(wiki).not.toContain('wiki-mobile-web.css?inline');
    expect(country).not.toContain('data-country-mobile-web-styles');
    expect(wiki).not.toContain('data-wiki-mobile-web-styles');
  });

  it("preserves the flag contract and isolates CSS from app and desktop", () => {
    const css = read("src/country-mobile-web.css");
    const masthead = read("src/components/country/CountryMobileWebMasthead.tsx");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain('[data-country-layout-mode="mobile-web"]');
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("font-size: clamp(.875rem, 4.5vw, 1.25rem);");
    expect(css).not.toContain(":root {");
    expect(masthead).toContain("aspect-[3/2]");
    expect(masthead).toContain("FlagFrame");
    // The legacy detail alias redirects back to the canonical Country page
    // when Reference is enabled; navigation must go to the Reference index.
    expect(masthead).toContain('<Link to="/wiki" className={COUNTRY_MOBILE_LINK_CLASS}>');
    expect(masthead).not.toContain('to="/wiki/$code"');
    expect(masthead).toContain("hasLongDescription");
    expect(masthead).toContain("aria-controls={descriptionId}");
    expect(masthead).toContain("aria-expanded={descriptionExpanded}");
    expect(masthead).toContain("line-clamp-3");
    expect(masthead).toContain("data-collapsed={hasLongDescription && !descriptionExpanded");
    expect(masthead).not.toContain("useAllResults");
    expect(masthead).not.toContain("supabase");
  });
});
