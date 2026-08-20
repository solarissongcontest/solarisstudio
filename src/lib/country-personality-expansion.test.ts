import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const visualTheme = source("src/lib/visual-theme.ts");
const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
const css = source("src/country-personalities.css");
const polishCss = source("src/country-personalities-polish.css");
const backgroundFlag = source("src/components/BackgroundFlag.tsx");
const routeVisualTheme = source("src/components/RouteVisualTheme.tsx");
const migration = source("supabase/migrations/20260820160000_expand_country_page_personalities.sql");

const newLayouts = [
  "panorama",
  "monument",
  "glass-card",
  "newspaper",
  "ribbon",
  "duotone",
  "passport",
  "horizon",
];

const directImageLayouts = [
  "editorial",
  "flag-focus",
  "poster",
  "split",
  "broadcast",
  "panorama",
  "glass-card",
  "newspaper",
  "ribbon",
  "duotone",
  "passport",
  "horizon",
];

describe("expanded country page personalities", () => {
  it("registers sixteen supported hero layouts in the client and database", () => {
    for (const layout of newLayouts) {
      expect(visualTheme).toContain(`| \"${layout}\"`);
      expect(visualTheme).toContain(`\"${layout}\",`);
      expect(migration).toContain(`'${layout}'`);
      expect(editor).toContain(`value: \"${layout}\"`);
    }
  });

  it("uses the original flag asset directly for geometric layouts", () => {
    expect(backgroundFlag).toContain("--background-flag-image");
    expect(polishCss).toContain("background-image: var(--background-flag-image)");
    expect(polishCss).toContain(".country-hero-background-flag > svg");
    expect(polishCss).toContain("display: none !important");
    for (const layout of directImageLayouts) {
      expect(polishCss).toContain(`[data-country-hero-layout=\"${layout}\"]`);
    }
  });

  it("keeps mobile heroes compact instead of inheriting tall desktop canvases", () => {
    expect(polishCss).toContain("@media (max-width: 767px)");
    expect(polishCss).toContain("min-height: auto !important");
    expect(polishCss).toContain('[data-country-hero-layout="glass-card"]');
    expect(polishCss).toContain('[data-country-hero-layout="split"]');
    expect(polishCss).toContain('[data-country-hero-layout="passport"]');
  });

  it("uses layered liquid glass with progressive refraction", () => {
    expect(polishCss).toContain("-webkit-backdrop-filter: blur(16px) saturate(175%)");
    expect(polishCss).toContain('backdrop-filter: url("#solaris-liquid-glass")');
    expect(polishCss).toContain("mix-blend-mode: screen");
    expect(routeVisualTheme).toContain('id="solaris-liquid-glass"');
    expect(routeVisualTheme).toContain("feDisplacementMap");
    expect(routeVisualTheme).toContain("feTurbulence");
  });

  it("binds country and wiki headings to the configured main-text colour", () => {
    expect(css).toContain('.app-main :is(h1, h2, h3, h4, h5, h6)');
    expect(css).toContain("color: var(--foreground) !important");
  });
});
