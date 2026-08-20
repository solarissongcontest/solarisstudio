import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const visualTheme = source("src/lib/visual-theme.ts");
const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
const css = source("src/country-personalities.css");
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

const rectangularLayouts = [
  "editorial",
  "flag-focus",
  "poster",
  "split",
  "broadcast",
  "panorama",
  "monument",
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
    expect(editor).toContain("Sixteen deliberately different header compositions");
  });

  it("keeps circular flag art only for layouts where an emblem shape is intentional", () => {
    expect(backgroundFlag).toContain("--background-flag-image");
    expect(css).toContain("Only Classic and Spotlight use the original circular dissolve");
    for (const layout of rectangularLayouts) {
      expect(css).toContain(`[data-country-hero-layout=\"${layout}\"]`);
    }
    expect(css).toContain(".country-hero-background-flag > svg");
    expect(css).toContain("display: none !important");
    expect(css).toContain("aspect-ratio: 3 / 2 !important");
  });

  it("keeps mobile heroes compact instead of inheriting tall desktop canvases", () => {
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain('[data-country-hero-layout="glass-card"]');
    expect(css).toContain("min-height: 20rem !important");
    expect(css).toContain('[data-country-hero-layout="split"]');
    expect(css).toContain("min-height: 24rem !important");
    expect(css).toContain('[data-country-hero-layout="passport"]');
    expect(css).toContain("min-height: 16rem !important");
  });

  it("uses layered liquid glass with a progressive refraction filter", () => {
    expect(css).toContain("-webkit-backdrop-filter: blur(22px) saturate(175%) brightness(1.06)");
    expect(css).toContain("backdrop-filter: url(\"#solaris-liquid-glass\")");
    expect(routeVisualTheme).toContain('id="solaris-liquid-glass"');
    expect(routeVisualTheme).toContain("feDisplacementMap");
    expect(routeVisualTheme).toContain("feTurbulence");
  });

  it("binds country and wiki headings to the configured main-text colour", () => {
    expect(css).toContain('.app-main :is(h1, h2, h3, h4, h5, h6)');
    expect(css).toContain("color: var(--foreground) !important");
    expect(editor).toContain("Main text now controls every country/Wiki heading");
  });
});