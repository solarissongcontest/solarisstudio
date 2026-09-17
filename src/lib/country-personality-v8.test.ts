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

describe("country personality V8", () => {
  it("keeps seventeen deliberate primary personalities and stable legacy aliases", () => {
    expect(COUNTRY_PERSONALITIES).toHaveLength(17);
    expect(new Set(COUNTRY_PERSONALITIES.map((item) => item.id)).size).toBe(17);
    expect(canonicalCountryPersonalityId("water-drop")).toBe("glass-card");
    expect(canonicalCountryPersonalityId("split")).toBe("classic");
    expect(countryPersonality("water-drop").name).toBe("Glass");
    expect(countryPersonality("split").name).toBe("Diplomatic");
  });

  it("grounds every personality in a professional design lineage and explicit rules", () => {
    for (const personality of COUNTRY_PERSONALITIES) {
      expect(personality.name.length).toBeGreaterThan(2);
      expect(personality.concept.length).toBeGreaterThan(40);
      expect(personality.referenceFamily.length).toBeGreaterThan(8);
      expect(personality.implementationReference.length).toBeGreaterThan(30);
      expect(personality.rules.length).toBeGreaterThanOrEqual(3);
      expect(personality.rejects.length).toBeGreaterThanOrEqual(4);
      expect(personality.signature.length).toBeGreaterThanOrEqual(3);
      expect(personality.decorations.length).toBeGreaterThan(0);
      expect(["compact", "balanced", "airy"]).toContain(personality.density);
      expect(["editorial", "chronicle", "modern"]).toContain(personality.wikiStyle);
      expect(wikiStyleForPersonality(personality.id)).toBe(personality.wikiStyle);
      expect(personalityDecorations(personality.id)).toEqual(personality.decorations);
    }
  });

  it("uses the shared semantic hero and reserves a bounded art cell for expressive personalities", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const css = source("src/country-personality-system-v8.css");

    expect(hero).toContain("country-hero-copy");
    expect(hero).toContain("country-hero-flag-zone");
    expect(hero).toContain("country-hero-actions");
    expect(hero).toContain("country-hero-art");
    expect(hero).toContain('data-country-has-art={definition.allowsGraphicArt ? "true" : "false"}');
    expect(hero).toContain('data-flag-role="official"');
    expect(hero).toContain('dir="auto"');
    expect(css).toContain(".country-hero-art {");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain('grid-template-areas:\n    "copy art flag"\n    "actions art flag"');
  });

  it("protects official flags from stretching or unintended cropping", () => {
    const flag = source("src/components/FlagChip.tsx");
    const css = source("src/country-personality-system-v8.css");

    expect(flag).toContain('data-flag-role="official"');
    expect(flag).toContain('objectFit: "contain"');
    expect(css).toContain('[data-flag-role="official"] img');
    expect(css).toContain("object-fit: contain !important");
    expect(css).not.toMatch(/\[data-flag-role=[^\]]+\][^{]*\{[^}]*object-fit:\s*cover/s);
  });

  it("removes the V7 repair cascade and loads one V8 personality system plus one Wiki system", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('import personalityV8 from "@/country-personality-system-v8.css?inline"');
    expect(styles).toContain('import wikiV8 from "@/country-wiki-v8.css?inline"');
    expect(styles).not.toContain("country-personality-system-v7.css");
    expect(styles).not.toContain("country-personality-system-v7-refinements.css");
    expect(styles).not.toContain("country-personality-v7-production-bridge.css");
    expect(styles).not.toContain("country-liquid-glass-public-v7.css");
    expect(styles).not.toContain("unlayerV7");
  });

  it("makes hard decoration impossible to roam across semantic content", () => {
    const css = source("src/country-personality-system-v8.css");
    expect(css).toContain("Old decorative layers are disabled");
    expect(css).toContain(":is(.country-personality-signature, .country-glass-panel-flag) {");
    expect(css).toContain("display: none !important;");
    expect(css).not.toContain("country-hero-signature-a");
    expect(css).not.toContain("country-hero-signature-b");
    expect(css).not.toContain("country-hero-signature-c");
    expect(css).not.toContain("z-index: 999");
  });

  it("implements Glass as one functional floating glass plate over a scene", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const css = source("src/country-personality-system-v8.css");
    const styles = source("src/components/CountryPersonalityStyles.tsx");

    expect(hero).toContain("country-hero-scene");
    expect(hero).toContain("--glass-pointer-x");
    expect(css).toContain('data-country-personality="glass-card"');
    expect(css).toContain(".country-hero-layout {");
    expect(css).toContain("backdrop-filter: blur(20px) saturate(132%)");
    expect(css).toContain(".country-hero-scene-flag");
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(styles).toContain("PublicLiquidGlassPointerController");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps Wiki article-first, readable and personality-subordinate", () => {
    const wiki = source("src/country-wiki-v8.css");
    expect(wiki).toContain("--wiki-measure: 72ch");
    expect(wiki).toContain("grid-template-columns: var(--wiki-sidebar) minmax(0, 1fr) var(--wiki-infobox)");
    expect(wiki).toContain(".wiki-article-surface {");
    expect(wiki).toContain("background: transparent !important");
    expect(wiki).toContain(".wiki-desktop-contents");
    expect(wiki).toContain(".wiki-desktop-infobox");
    expect(wiki).toContain("@media print");
    expect(wiki).toContain("max-inline-size: 100% !important");
    expect(wiki).toContain("block-size: auto !important");
  });

  it("supports responsive reflow and accessibility preferences", () => {
    const css = source("src/country-personality-system-v8.css");
    const wiki = source("src/country-wiki-v8.css");
    expect(css).toContain("@container country-identity (width < 52rem)");
    expect(css).toContain("@container country-identity (width < 40rem)");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
    expect(wiki).toContain("scroll-margin-block-start");
    expect(wiki).toContain("@media (forced-colors: active)");
  });
});
