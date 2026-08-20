import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const visualTheme = source("src/lib/visual-theme.ts");
const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
const css = source("src/country-personalities.css");
const backgroundFlag = source("src/components/BackgroundFlag.tsx");
const routeVisualTheme = source("src/components/RouteVisualTheme.tsx");
const countryRoute = source("src/routes/countries/$code.tsx");
const wikiRoute = source("src/routes/wiki/$code.tsx");
const customSections = source("src/components/country/CountryCustomSections.tsx");
const migration = source("supabase/migrations/20260820160000_expand_country_page_personalities.sql");
const decorationMigration = source(
  "supabase/migrations/20260820190000_expand_country_decoration_styles.sql",
);

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
      expect(visualTheme).toContain(`| "${layout}"`);
      expect(visualTheme).toContain(`"${layout}",`);
      expect(migration).toContain(`'${layout}'`);
      expect(editor).toContain(`value: "${layout}"`);
    }
  });

  it("uses the original flag asset directly for layouts that need rectangular geometry", () => {
    expect(backgroundFlag).toContain("--background-flag-image");
    expect(css).toContain("background-image: var(--background-flag-image)");
    expect(css).toContain(".country-hero-background-flag > svg");
    expect(css).toContain("display: none !important");
    expect(css).toContain("Only Classic and Spotlight use the original circular dissolve");
    for (const layout of rectangularLayouts) {
      expect(css).toContain(`[data-country-hero-layout="${layout}"]`);
    }
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

  it("uses layered liquid glass with progressive refraction", () => {
    const repairCss = source("src/country-personalities-v4.css");
    expect(repairCss).toContain("-webkit-backdrop-filter: blur(24px) saturate(175%) brightness(1.06)");
    expect(repairCss).toContain("filter: blur(14px) saturate(1.25) contrast(1.04)");
    expect(repairCss).toContain("The hero is not a second glass rectangle");
    expect(repairCss).toContain("Old saved orbit/ray/grid choices");
    expect(css).toContain('backdrop-filter: url("#solaris-liquid-glass")');
    expect(css).toContain("inset 0 1px 0 rgb(255 255 255 / .42)");
    expect(routeVisualTheme).toContain('id="solaris-liquid-glass"');
    expect(routeVisualTheme).toContain("feDisplacementMap");
    expect(routeVisualTheme).toContain("feTurbulence");
  });

  it("loads only the base personality system and the isolated final repair", () => {
    expect(routeVisualTheme).toContain('import "@/country-personalities.css"');
    expect(routeVisualTheme).toContain('import "@/country-personalities-v4.css"');
    expect(routeVisualTheme).not.toContain("country-personalities-v2.css");
    expect(routeVisualTheme).not.toContain("country-personalities-v3.css");
  });

  it("keeps optional motifs crisp and opt-in instead of assigning them automatically", () => {
    const repairCss = source("src/country-personalities-v4.css");
    for (const motif of [
      "orbits",
      "rays",
      "grid",
      "waves",
      "aurora",
      "constellation",
      "facets",
      "topography",
      "eclipse",
    ]) {
      expect(repairCss).toContain(`[data-country-decoration="${motif}"]`);
      expect(visualTheme).toContain(`| "${motif}"`);
      expect(visualTheme).toContain(`"${motif}",`);
      expect(editor).toContain(`value: "${motif}"`);
      expect(decorationMigration).toContain(`'${motif}'`);
    }
    expect(repairCss).toContain("resolution-independent CSS lines");
    expect(repairCss).toContain('[data-country-decoration="auto"]');
    expect(repairCss).toContain("content: none !important");
  });

  it("uses the same motif renderer in the editor preview and public heroes", () => {
    const repairCss = source("src/country-personalities-v4.css");
    expect(editor).toContain("country-public-hero glass");
    expect(editor).toContain("<BackgroundFlag");
    expect(editor).toContain("themeStyleProperties(theme)");
    expect(editor).not.toContain("function PreviewDecoration");
    expect(repairCss).toContain('.country-decoration-layer[data-decoration="aurora"]');
    expect(repairCss).toContain('[data-country-decoration="aurora"]');
    expect(editor).not.toContain("repeating-conic-gradient(from -10deg");
  });

  it("keeps auto decorations structural and makes the matched Glass flag optional", () => {
    const repairCss = source("src/country-personalities-v4.css");
    expect(editor).toContain('theme.decorationStyle === "none" ? "none" : "flag"');
    expect(editor).toContain('if (theme.heroLayout === "minimal") return "none"');
    expect(editor).toContain('return "flag"');
    expect(editor).toContain('["auto", "none", "flag"]');
    expect(editor).toContain('? { ...existing, decorationStyle: "auto" }');
    expect(repairCss).toContain(".country-glass-panel-flag");
    expect(repairCss).toContain(':not([data-country-decoration="none"])');
    expect(countryRoute).toContain('className="country-glass-panel-flag"');
    expect(wikiRoute).toContain('className="country-glass-panel-flag"');
    expect(css).toContain('[data-preview-layout="glass-card"] > div.relative.z-10 {');
    expect(css).not.toContain(
      '[data-preview-layout="glass-card"] > div.relative.z-10 > div',
    );
  });

  it("continues each personality through country and Wiki content cards", () => {
    const repairCss = source("src/country-personalities-v4.css");
    expect(wikiRoute).toContain("country-personality-card");
    expect(wikiRoute).toContain("country-personality-inset");
    expect(customSections).toContain(
      'presentation.panelStyle === "transparent" ? "" : "country-personality-card"',
    );
    expect(repairCss).toContain("Personality continuity");
    for (const layout of [
      "classic",
      "editorial",
      "minimal",
      "flag-focus",
      "poster",
      "split",
      "spotlight",
      "broadcast",
      "panorama",
      "monument",
      "glass-card",
      "newspaper",
      "ribbon",
      "duotone",
      "passport",
      "horizon",
    ]) {
      expect(repairCss).toContain(`[data-country-hero-layout="${layout}"]`);
    }
  });

  it("binds country and wiki headings to the configured main-text colour", () => {
    expect(css).toContain('.app-main :is(h1, h2, h3, h4, h5, h6)');
    expect(css).toContain("color: var(--foreground) !important");
  });
});
