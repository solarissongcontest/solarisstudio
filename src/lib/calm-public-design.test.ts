import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("calm public design contract", () => {
  it("actually loads the calm public layout and chrome layers", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    const personalityStyles = source("src/components/CountryPersonalityStyles.tsx");
    expect(visual).toContain('import "@/calm-public-layout.css"');
    expect(visual).toContain('import "@/calm-public-chrome.css"');
    expect(personalityStyles).toContain(
      'import glassParityStyles from "@/country-glass-parity.css?inline"',
    );
  });

  it("lets route colours reach navigation, selectors and controls", () => {
    const chrome = source("src/calm-public-chrome.css");
    expect(chrome).not.toContain("--solaris-accent: var(--solaris-bg-primary)");
    expect(source("src/colour-harmony.css")).toContain("--solaris-accent:");
    expect(chrome).toContain(".site-nav");
    expect(chrome).toContain(".mobile-quick-nav");
    expect(chrome).toContain(":is(.public-drawer, .nav-menu-panel)");
    expect(chrome).toContain('.responsive-tabs button[aria-current="page"]');
    expect(chrome).toContain(".directory-page-filter");
  });

  it("keeps the useful direct hubs instead of generic overview gates", () => {
    for (const route of ["analysis", "pulse", "countries", "wiki", "editions", "records"]) {
      expect(() => source(`src/routes/${route}/index.tsx`)).not.toThrow();
    }
  });

  it("renders Glass Card as one full-width surface on public pages and preview", () => {
    const css = source("src/country-glass-parity.css");
    expect(css).toContain('[data-country-hero-layout="glass-card"]');
    expect(css).toContain('[data-preview-layout="glass-card"]');
    expect(css).toContain("content: none !important");
    expect(css).toContain("display: none !important");
    expect(css).toContain("width: 100% !important");
    expect(css).toContain("max-width: none !important");
    expect(css).toContain(".country-glass-panel-flag");
  });

  it("gives responsive tabs a themeable active state", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    expect(tabs).toContain("responsive-tabs min-w-0");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
  });
});
