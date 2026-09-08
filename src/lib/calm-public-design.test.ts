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
    expect(personalityStyles).toContain('import glassParityStyles from "@/country-glass-parity.css?inline"');
    expect(personalityStyles).toContain('import glassFinalStyles from "@/country-glass-final.css?inline"');
    expect(personalityStyles.indexOf("\n  glassFinalStyles,")).toBeGreaterThan(
      personalityStyles.indexOf("\n  waterDropStyles,"),
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

  it("renders Glass Card as one full-width surface on public pages and preview", () => {
    const parity = source("src/country-glass-parity.css");
    const final = source("src/country-glass-final.css");
    expect(parity).toContain('[data-country-hero-layout="glass-card"]');
    expect(parity).toContain('[data-preview-layout="glass-card"]');
    expect(parity).toContain("content: none !important");
    expect(parity).toContain("display: none !important");
    expect(final).toContain("width: 100% !important");
    expect(final).toContain("max-width: none !important");
    expect(final).toContain("min-height: 0 !important");
    expect(final).toContain("height: auto !important");
    expect(final).toContain("rgb(255 255 255 / .085)");
    expect(final).toContain("opacity: .22 !important");
    expect(final).toContain(".country-glass-panel-flag");
  });

  it("gives responsive tabs a themeable active state", () => {
    const tabs = source("src/components/ResponsiveTabs.tsx");
    expect(tabs).toContain("responsive-tabs min-w-0");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
  });
});
