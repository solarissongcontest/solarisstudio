import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCountryLayoutMode } from "./country-layout-mode";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country page presentation ownership", () => {
  it("keeps three products distinct even at the same phone width", () => {
    expect(resolveCountryLayoutMode(false, true)).toBe("mobile-web");
    expect(resolveCountryLayoutMode(false, false)).toBe("desktop-web");
    expect(resolveCountryLayoutMode(true, true)).toBe("installed-app");
    expect(resolveCountryLayoutMode(true, false)).toBe("installed-app");
    const countryLayout = read("src/lib/country-layout-mode.ts");
    expect(countryLayout).toContain("resolveCountryDirectoryPresentation");
    expect(countryLayout).toContain("COUNTRY_DIRECTORY_MOBILE_MEDIA");
  });

  it("keeps the installed-app route gated and the browser route separate", () => {
    const gate = read("src/components/v3/V3DelegationRouteGate.tsx");
    const route = read("src/routes/countries/$code.tsx");
    expect(gate).toContain('if (!isAppMode) return <>{legacy}</>');
    expect(gate).toContain("<V3DelegationScreen");
    expect(route).toContain("const countryLayoutMode = useCountryLayoutMode()");
    expect(route).toContain('publishedDesign && countryLayoutMode !== "mobile-web"');
    expect(route).toContain('countryLayoutMode === "mobile-web" ? (');
    expect(route).toContain("<CountryMobileWebMasthead");
    expect(route).toContain('data-country-layout-mode={countryLayoutMode}');
    expect(route).toContain("<ResponsiveTabs");
    expect(route).toContain("<CountryDesignV2Hero");
    expect(route).toContain("<CountryIdentityHero");
  });

  it("shares runtime-first layout selection with Wiki while keeping its browser article intact", () => {
    const hook = read("src/lib/use-country-layout-mode.ts");
    const wiki = read("src/components/wiki/CountryWikiExperience.tsx");
    const css = read("src/wiki-mobile-web.css");

    const directoryHook = read("src/lib/use-country-directory-presentation.ts");
    expect(hook).toContain("useCountryDirectoryPresentation()");
    expect(hook).not.toContain("useEffect(");
    expect(hook).not.toContain("matchMedia");
    expect(directoryHook).toContain("useSolarisApp()");
    expect(directoryHook).toContain("useSyncExternalStore(");
    expect(directoryHook).toContain("COUNTRY_DIRECTORY_MOBILE_MEDIA");
    expect(wiki).toContain("const countryLayoutMode = useCountryLayoutMode()");
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
    expect(masthead).toContain("hasLongDescription");
    expect(masthead).toContain("aria-controls={descriptionId}");
    expect(masthead).toContain("aria-expanded={descriptionExpanded}");
    expect(masthead).toContain("line-clamp-3");
    expect(masthead).toContain("data-collapsed={hasLongDescription && !descriptionExpanded");
    expect(masthead).not.toContain("useAllResults");
    expect(masthead).not.toContain("supabase");
  });
});
