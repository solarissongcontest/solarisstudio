import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm public design contract", () => {
  it("actually loads the calm public chrome and consolidated V7 country layers", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    const personalityStyles = source("src/components/CountryPersonalityStyles.tsx");
    expect(visual).toContain('import "@/calm-public-layout.css"');
    expect(visual).toContain('import "@/calm-public-chrome.css"');
    expect(personalityStyles).toContain('import wikiStyles from "@/country-wiki.css?inline"');
    expect(personalityStyles).toContain('import buttonStyles from "@/country-button-theme.css?inline"');
    expect(personalityStyles).toContain('import v7Styles from "@/country-personality-system-v7.css?inline"');
    expect(personalityStyles).toContain('import wikiV7 from "@/country-wiki-v7.css?inline"');
    expect(personalityStyles).toContain('import liquidGlassPublic from "@/country-liquid-glass-public-v7.css?inline"');
    expect(personalityStyles.indexOf("\n  wikiV7,")).toBeGreaterThan(
      personalityStyles.indexOf("\n  productionBridge,"),
    );
    expect(personalityStyles.indexOf("\n  liquidGlassPublic,")).toBeGreaterThan(
      personalityStyles.indexOf("\n  wikiV7,"),
    );
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

  it("renders Glass as one adaptive Liquid Glass material instead of stacked opaque cards", () => {
    const publicGlass = source("src/country-liquid-glass-public-v7.css");
    const refinements = source("src/country-personality-system-v7-refinements.css");
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    expect(publicGlass).toContain("Public Liquid Glass V7");
    expect(publicGlass).toContain("content-informed tint");
    expect(publicGlass).toContain("concentrated specular light");
    expect(publicGlass).toContain("--glass-pointer-x: 72%");
    expect(publicGlass).toContain("backdrop-filter: blur(30px) saturate(178%) contrast(1.055)");
    expect(publicGlass).toContain("mix-blend-mode: screen");
    expect(publicGlass).toContain(".country-glass-panel-flag");
    expect(publicGlass).toContain("The Wiki article itself is not turned into Liquid Glass");
    expect(refinements).toContain("country-liquid-glass-refraction");
    expect(refinements).toContain("country-liquid-glass-specular");
    expect(hero).toContain("moveGlassLight");
    expect(hero).toContain("--glass-pointer-x");
  });

  it("gives responsive tabs a themeable active state", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    expect(tabs).toContain("responsive-tabs min-w-0");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
  });
});
