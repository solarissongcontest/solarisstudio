import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm public design contract", () => {
  it("actually loads the calm public chrome and source-driven Country layers", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    const personalityStyles = source("src/components/CountryPersonalityStyles.tsx");
    expect(visual).toContain('import "@/calm-public-layout.css"');
    expect(visual).toContain('import "@/calm-public-chrome.css"');
    expect(personalityStyles).toContain('import buttonStyles from "@/country-button-theme.css?inline"');
    expect(personalityStyles).toContain('import sharedFoundation from "@/country-personality-shared-foundation.css?inline"');
    expect(personalityStyles).not.toContain("country-personality-system-v8.css");
    expect(personalityStyles).toContain('import wikiV8 from "@/country-wiki-v8.css?inline"');
    expect(personalityStyles).toContain('import wikiComponentsV8 from "@/country-wiki-components-v8.css?inline"');
    expect(personalityStyles).not.toContain("country-wiki.css?inline");
    expect(personalityStyles).not.toContain("country-personality-system-v7.css");
    expect(personalityStyles).not.toContain("productionBridge");
    expect(personalityStyles).not.toContain("unlayerV7");
    expect(personalityStyles).toContain('.join("\\n")');
  });

  it("lets route colours reach navigation, selectors and controls", () => {
    const chrome = source("src/calm-public-chrome.css");
    expect(chrome).toContain("--solaris-accent: var(--solaris-bg-primary)");
    expect(chrome).toContain(".site-nav");
    expect(chrome).toContain(".mobile-quick-nav");
    expect(chrome).toContain(":is(.public-drawer, .nav-menu-panel)");
    expect(chrome).toContain(".responsive-tabs button[aria-current=\"page\"]");
    expect(chrome).toContain(".directory-page-filter");
  });

  it("keeps the useful direct hubs instead of generic overview gates", () => {
    for (const route of ["analysis", "pulse", "countries", "wiki", "editions", "records"]) {
      expect(() => source(`src/routes/${route}/index.tsx`)).not.toThrow();
    }
  });

  it("renders Glass as one Liquid Glass identity plate instead of stacked opaque cards", () => {
    const css = source("src/styles/personalities/glass-source.adapter.css");
    const wiki = source("src/country-wiki-v8.css");
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    expect(css).toContain("samasante/liquid-glass");
    expect(css).toContain(".country-hero-scene-flag");
    expect(css).toContain("country-hero-glass-material");
    expect(hero).toContain('import("@/vendor/liquid-glass/GlassMaterial")');
    expect(hero).toContain("<Suspense fallback={composition}>");
    expect(css).not.toContain("country-liquid-glass-refraction");
    expect(css).not.toContain("country-liquid-glass-specular");
    expect(hero).toContain("moveGlassLight");
    expect(hero).toContain("--glass-pointer-x");
    expect(hero).toContain("country-hero-scene");
    expect(wiki).toContain("exactly one real refractive plate");
    expect(wiki).toContain(".country-hero-glass-material");
  });

  it("gives responsive tabs a themeable active state", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    expect(tabs).toContain("responsive-tabs min-w-0");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
  });
});
