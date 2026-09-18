import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm public UI contract", () => {
  it("loads calm layout and chrome after the shared route/entity palettes", () => {
    const imports = source("src/card-typography.css");
    expect(imports.indexOf('colour-harmony.css')).toBeLessThan(imports.indexOf('calm-public-chrome.css'));
    expect(imports.indexOf('entity-theme.css')).toBeLessThan(imports.indexOf('calm-public-chrome.css'));
    expect(imports).toContain('@import "./calm-public-layout.css";');
  });

  it("keeps route-family chrome coordinated without overriding entity-owned themes", () => {
    const chrome = source("src/calm-public-chrome.css");
    expect(chrome).toContain('body[data-solaris-family]:not([data-entity-theme]) .site-nav');
    expect(chrome).toContain('body[data-solaris-family]:not([data-entity-theme]) .mobile-quick-nav');
    expect(chrome).toContain(':is(.public-drawer, .nav-menu-panel)');
    expect(chrome).toContain('button.bg-primary');
  });

  it("uses a calm page identity instead of another overview gate", () => {
    const layout = source("src/calm-public-layout.css");
    expect(layout).toContain('.page-header:not(.directory-page-hero)');
    expect(layout).toContain('box-shadow: inset 0 1px 0');
    expect(layout).not.toContain('Overview → Discover → Deep dive');
  });

  it("keeps Glass Country, Wiki and preview on the canonical shared hero", () => {
    const glass = source("src/styles/personalities/glass-source.adapter.css");
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const appearance = source("src/components/mysolaris/modules/MySolarisAppearanceModule.tsx");
    expect(glass).toContain('data-country-personality="glass-card"');
    expect(glass).toContain("country-hero-glass-material");
    expect(hero).toContain("<LazyGlassMaterial");
    expect(hero).toContain("country-hero-layout");
    expect(appearance).toContain("<CountryIdentityHero");
    expect(glass).not.toContain(".country-glass-panel-flag");
  });
});