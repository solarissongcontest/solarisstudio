import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const visualTheme = source("src/lib/visual-theme.ts");
const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
const styles = source("src/components/CountryPersonalityStyles.tsx");
const css = source("src/country-personalities-v5.css");
const controller = source("src/components/CountryFlagLayerController.tsx");
const migration = source(
  "supabase/migrations/20260824223000_add_scifi_water_drop_country_personalities.sql",
);

const layouts = [
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
  "heritage",
  "sci-fi",
  "water-drop",
];

describe("country personality V5 art direction", () => {
  it("registers all nineteen layouts including Sci-Fi and Water Drop", () => {
    for (const layout of layouts) {
      expect(visualTheme).toContain(`"${layout}"`);
      expect(editor).toContain(`value: "${layout}"`);
      expect(css).toContain(`data-country-hero-layout="${layout}"`);
    }
    expect(migration).toContain("'sci-fi'");
    expect(migration).toContain("'water-drop'");
  });

  it("uses explicit user-facing names for the requested new directions", () => {
    expect(editor).toContain('value: "monument", label: "Luxurious"');
    expect(editor).toContain('value: "heritage", label: "Traditional"');
    expect(editor).toContain('value: "sci-fi", label: "Sci-Fi"');
    expect(editor).toContain('value: "water-drop", label: "Water Drop"');
  });

  it("loads the final V5 layer after all legacy repair layers", () => {
    expect(styles).toContain('import artDirectionStyles from "@/country-personalities-v5.css?inline"');
    expect(styles.indexOf("{artDirectionStyles}")).toBeGreaterThan(styles.indexOf("{feedbackStyles}"));
  });

  it("locks the pixel-target mobile hero heights", () => {
    const targets: Record<string, number> = {
      classic: 238,
      editorial: 265,
      minimal: 210,
      "flag-focus": 275,
      poster: 300,
      split: 275,
      spotlight: 255,
      broadcast: 260,
      panorama: 285,
      monument: 278,
      "glass-card": 280,
      newspaper: 235,
      ribbon: 250,
      duotone: 260,
      passport: 255,
      horizon: 245,
      heritage: 268,
      "sci-fi": 272,
      "water-drop": 278,
    };

    for (const [layout, height] of Object.entries(targets)) {
      expect(css).toContain(
        `[data-country-hero-layout="${layout}"] .country-public-hero { min-height: ${height}px !important;`,
      );
    }
  });

  it("keeps Wiki heroes article-first on phones", () => {
    expect(css).toContain(".wiki-public-hero { min-height: 165px !important;");
    expect(css).toContain('[data-country-hero-layout="minimal"] .wiki-public-hero { min-height: 145px !important;');
    expect(css).toContain("min-height: 205px !important;");
  });

  it("gives Sci-Fi a projected technical composition", () => {
    expect(css).toContain("TS // ACTIVE");
    expect(css).toContain("perspective(600px) rotateY(-12deg)");
    expect(css).toContain("background-size: 24px 24px, 24px 24px, auto !important;");
  });

  it("gives Water Drop an organic refractive flag shape", () => {
    expect(css).toContain('[data-country-hero-layout="water-drop"]');
    expect(css).toContain("border-radius: 62% 38% 56% 44% / 46% 55% 45% 54% !important;");
    expect(css).toContain("width: 190px !important;");
    expect(css).toContain("height: 215px !important;");
  });

  it("makes Luxurious and Traditional structurally different", () => {
    expect(css).toContain("/* LUXURIOUS (stored as monument)");
    expect(css).toContain("◆  TERRA SOLARIS  ◆");
    expect(css).toContain("/* TRADITIONAL (stored as heritage)");
    expect(css).toContain("width: 72px !important; height: 48px !important;");
  });

  it("uses Gotham and Classica only in the V5 personality layer", () => {
    expect(css).toContain('font-family: "Gotham"');
    expect(css).toContain('font-family: "Classica Crastao"');
    expect(css).not.toContain("Sora");
    expect(css).not.toContain("Manrope");
  });

  it("uses a compact two-column personality picker with selected-only description", () => {
    expect(editor).toContain("country-personality-picker grid grid-cols-2 gap-2");
    expect(editor).toContain("selectedPersonality.description");
    expect(editor).not.toContain("{description}\n                  </span>");
  });

  it("curates decoration choices per personality instead of exposing every combination", () => {
    expect(editor).toContain("const CURATED_DECORATIONS: Record<CountryHeroLayout, CountryDecorationStyle[]>");
    expect(editor).toContain('"sci-fi": ["auto", "grid", "constellation", "none"]');
    expect(editor).toContain('"water-drop": ["auto", "waves", "flag", "none"]');
    expect(editor).toContain("DECORATIONS.filter(({ value }) => curatedDecorations.includes(value))");
  });

  it("lets personality CSS own flag geometry instead of the flag controller", () => {
    expect(controller).toContain("does not\n         force a flag layer on");
    expect(controller).not.toContain("inset: 0 0 0 52% !important");
    for (const layout of ["glass-card", "passport", "heritage", "sci-fi", "water-drop"]) {
      expect(controller).toContain(`[data-country-hero-layout="${layout}"]`);
    }
  });
});
