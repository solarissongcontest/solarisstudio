import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COUNTRY_PERSONALITIES,
  canonicalCountryPersonalityId,
  countryPersonality,
  personalityDecorations,
  wikiStyleForPersonality,
} from "./country-personality-system";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country personality V7", () => {
  it("uses seventeen deliberate primary personalities and preserves legacy saved values through aliases", () => {
    expect(COUNTRY_PERSONALITIES).toHaveLength(17);
    expect(new Set(COUNTRY_PERSONALITIES.map((item) => item.id)).size).toBe(17);
    expect(canonicalCountryPersonalityId("water-drop")).toBe("glass-card");
    expect(canonicalCountryPersonalityId("split")).toBe("classic");
    expect(countryPersonality("water-drop").name).toBe("Glass");
    expect(countryPersonality("split").name).toBe("Diplomatic");
  });

  it("has a written design concept, density, Wiki style, signatures and curated decorations for every personality", () => {
    for (const personality of COUNTRY_PERSONALITIES) {
      expect(personality.name.length).toBeGreaterThan(2);
      expect(personality.concept.length).toBeGreaterThan(30);
      expect(["compact", "balanced", "airy"]).toContain(personality.density);
      expect(["editorial", "chronicle", "modern"]).toContain(personality.wikiStyle);
      expect(personality.signature.length).toBeGreaterThanOrEqual(3);
      expect(personality.decorations.length).toBeGreaterThan(0);
      expect(wikiStyleForPersonality(personality.id)).toBe(personality.wikiStyle);
      expect(personalityDecorations(personality.id)).toEqual(personality.decorations);
    }
  });

  it("drives the appearance editor from the registry instead of duplicating personality definitions", () => {
    const editor = source("src/components/mysolaris/modules/MySolarisAppearanceModule.tsx");
    expect(editor).toContain("COUNTRY_PERSONALITIES.map");
    expect(editor).toContain("countryPersonality(theme.heroLayout)");
    expect(editor).toContain("personalityDecorations(theme.heroLayout)");
    expect(editor).toContain("canonicalCountryPersonalityId(existing.heroLayout)");
    expect(editor).toContain("PreviewControls");
    expect(editor).toContain('PreviewDevice = "desktop" | "mobile"');
  });

  it("loads one V7 system instead of the old repair-on-repair cascade", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('import v7Styles from "@/country-personality-system-v7.css?inline"');
    expect(styles).toContain('import v7Refinements from "@/country-personality-system-v7-refinements.css?inline"');
    expect(styles).toContain('import wikiV7 from "@/country-wiki-v7.css?inline"');
    expect(styles).toContain('import liquidGlassPublic from "@/country-liquid-glass-public-v7.css?inline"');
    expect(styles).not.toContain("country-personalities-v4.css");
    expect(styles).not.toContain("country-personalities-v5.css");
    expect(styles).not.toContain("country-personalities-v6.css");
    expect(styles).not.toContain("country-water-drop-v61.css");
    expect(styles).not.toContain("wiki-card-restoration.css");
    expect(styles).not.toContain("wiki-mobile-encyclopedia.css");
  });

  it("protects semantic structure and official flag geometry", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const flag = source("src/components/FlagChip.tsx");
    const css = source("src/country-personality-system-v7.css");
    expect(hero).toContain("country-hero-layout");
    expect(hero).toContain('data-flag-role="official"');
    expect(hero).toContain('dir="auto"');
    expect(flag).toContain('data-flag-role="official"');
    expect(flag).toContain('objectFit: "contain"');
    expect(css).toContain("container: country-identity / inline-size");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("@container country-identity (width < 25rem)");
  });

  it("implements Liquid Glass as an adaptive optical material instead of a frosted card", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const refinements = source("src/country-personality-system-v7-refinements.css");
    const publicGlass = source("src/country-liquid-glass-public-v7.css");
    const styles = source("src/components/CountryPersonalityStyles.tsx");

    expect(hero).toContain("--glass-pointer-x");
    expect(hero).toContain("country-liquid-glass-refraction");
    expect(hero).toContain("country-liquid-glass-specular");
    expect(refinements).toContain("blur(30px) saturate(175%) contrast(1.055)");
    expect(refinements).toContain("radial-gradient(\n        ellipse 21% 16% at var(--glass-pointer-x) var(--glass-pointer-y)");
    expect(refinements).toContain("mix-blend-mode: screen");
    expect(publicGlass).toContain("--glass-pointer-x: 72%");
    expect(publicGlass).toContain("blur(30px) saturate(178%) contrast(1.055)");
    expect(publicGlass).toContain("content-informed tint");
    expect(publicGlass).toContain("concentrated specular light");
    expect(publicGlass).toContain("-webkit-backdrop-filter");
    expect(publicGlass).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(styles).toContain("PublicLiquidGlassPointerController");
    expect(styles).toContain("pointermove");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("supports accessibility preferences and does not hide focus behind personality styling", () => {
    const css = source("src/country-personality-system-v7.css");
    const bridge = source("src/country-personality-v7-production-bridge.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
    expect(bridge).toContain(":focus-visible");
    expect(bridge).toContain("outline: 3px solid");
  });
});
