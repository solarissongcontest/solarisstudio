import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("source-driven Country personality foundation", () => {
  it("uses the shared semantic hero on Country and Wiki", () => {
    const countryRoute = source("src/routes/countries/$code.tsx");
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    expect(countryRoute).toContain("<CountryIdentityHero");
    expect(wiki).toContain("<CountryIdentityHero");
    expect(countryRoute).not.toContain("country-personality-signature");
    expect(wiki).not.toContain("country-personality-signature");
    expect(countryRoute).toContain("useCountryTheme(country?.id)");
    expect(wiki).toContain("useCountryTheme(country.id)");
  });

  it("delegates one semantic identity model to source-specific composition renderers", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const renderer = source("src/components/country/personality/PersonalityHeroRenderer.tsx");
    const compositions = source("src/styles/personality-compositions.css");
    expect(hero).toContain("<PersonalityHeroRenderer");
    expect(hero).toContain('data-flag-role="official"');
    expect(hero).toContain('data-country-has-art={definition.id === "panorama" ? "true" : "false"}');
    expect(renderer).toContain("function GlassRenderer");
    expect(renderer).toContain("function PosterRenderer");
    expect(renderer).toContain("function PassportRenderer");
    expect(renderer).toContain("function RetroRenderer");
    expect(renderer).toContain("function AtlasRenderer");
    expect(renderer).toContain("function AvantGardeRenderer");
    expect(renderer).toContain('dir="auto"');
    expect(renderer).not.toContain("country-hero-art-primary");
    expect(renderer).not.toContain("country-hero-art-secondary");
    expect(renderer).not.toContain("country-hero-art-tertiary");
    expect(compositions).toContain(".country-composition-glass");
    expect(compositions).toContain(".country-composition-poster");
    expect(compositions).toContain(".country-composition-retro");
    expect(compositions).toContain(".country-composition-atlas");
  });

  it("protects official flags from stretching or unintended cropping", () => {
    const flag = source("src/components/FlagChip.tsx");
    const shared = source("src/country-personality-shared-foundation.css");
    const sourceFoundation = source("src/country-personality-source-foundation.css");
    const scoreboard = source("src/components/broadcast/CountryCard.tsx");
    expect(flag).toContain('data-flag-role="official"');
    expect(flag).toContain('aspect-[3/2]');
    expect(flag).toContain('objectFit: "contain"');
    expect(shared).toContain("--cp-flag-aspect: 3 / 2");
    expect(shared).toContain("aspect-ratio: var(--cp-flag-aspect)");
    expect(shared).toContain('[data-flag-role="official"] img');
    expect(sourceFoundation).toContain("inline-size: auto !important");
    expect(sourceFoundation).toContain("block-size: auto !important");
    expect(sourceFoundation).toContain("object-fit: contain !important");
    expect(scoreboard).toContain('objectFit: "contain"');
    expect(scoreboard).not.toContain('objectFit: zone.fit ?? "cover"');
    expect(shared).not.toMatch(/\[data-flag-role=[^\]]+\][^{]*\{[^}]*object-fit:\s*cover/s);
  });

  it("loads only shared foundations, Wiki mechanics and source adapters", () => {
    const styles = source("src/components/CountryPersonalityStyles.tsx");
    expect(styles).toContain('import sharedFoundation from "@/country-personality-shared-foundation.css?inline"');
    expect(styles).toContain('import sourceFoundation from "@/country-personality-source-foundation.css?inline"');
    expect(styles).toContain('import wikiV8 from "@/country-wiki-v8.css?inline"');
    expect(styles).toContain('import wikiComponentsV8 from "@/country-wiki-components-v8.css?inline"');
    expect(styles).toContain('import personalityCompositions from "@/styles/personality-compositions.css?inline"');
    expect(styles).not.toContain("country-personality-system-v8.css");
    expect(styles).not.toContain("country-personality-system-v7.css");
    expect(styles).not.toContain("country-personality-v7-production-bridge.css");
    expect(styles).not.toContain("country-liquid-glass-public-v7.css");
  });

  it("removes generic decorative art from rendered personality composition", () => {
    const css = source("src/country-personality-shared-foundation.css");
    const renderer = source("src/components/country/personality/PersonalityHeroRenderer.tsx");
    const compositions = source("src/styles/personality-compositions.css");
    expect(css).toContain("Old decorative layers are disabled");
    expect(css).toContain(":is(.country-personality-signature, .country-glass-panel-flag) {");
    expect(renderer).not.toContain("country-hero-art-primary");
    expect(renderer).not.toContain("country-hero-art-secondary");
    expect(renderer).not.toContain("country-hero-art-tertiary");
    expect(compositions).toContain("content is the graphic");
    expect(compositions).not.toContain("z-index: 999");
  });

  it("implements Glass from the vendored liquid-glass source adapter", () => {
    const hero = source("src/components/country/CountryIdentityHero.tsx");
    const css = source("src/styles/personalities/glass-source.adapter.css");
    const composition = source("src/styles/personality-compositions.css");
    const wiki = source("src/country-wiki-v8.css");
    expect(hero).toContain("country-hero-scene");
    expect(hero).toContain("--glass-pointer-x");
    expect(hero).toContain("<LazyGlassMaterial");
    expect(css).toContain("samasante/liquid-glass");
    expect(css).toContain("country-hero-glass-material");
    expect(composition).toContain("inline-size: 100%");
    expect(composition).toContain("margin: 0 !important");
    expect(composition).toContain("border-radius: inherit !important");
    expect(composition).not.toContain("margin: .65rem auto !important");
    expect(wiki).toContain("exactly one real refractive plate");
    expect(wiki).toContain(".country-hero-glass-material");
    expect(wiki).toContain("backdrop-filter: none;");
  });

  it("keeps Wiki article-first and personality-subordinate", () => {
    const wiki = source("src/country-wiki-v8.css");
    const components = source("src/country-wiki-components-v8.css");
    expect(wiki).toContain("--wiki-measure: 72ch");
    expect(wiki).toContain("grid-template-columns: var(--wiki-sidebar) minmax(0, 1fr) var(--wiki-infobox)");
    expect(wiki).toContain(".wiki-article-surface {");
    expect(wiki).toContain("background: transparent !important");
    expect(wiki).toContain(".wiki-desktop-contents");
    expect(wiki).toContain(".wiki-desktop-infobox");
    expect(wiki).toContain("@media print");
    expect(components).toContain(".wiki-entry-row");
    expect(components).toContain(".wiki-media-gallery");
    expect(components).toContain(".wiki-compact-contents");
  });

  it("supports responsive reflow and accessibility preferences without personality-specific legacy CSS", () => {
    const css = source("src/country-personality-shared-foundation.css");
    const wiki = source("src/country-wiki-v8.css");
    expect(css).toContain("@container country-identity (width < 52rem)");
    expect(css).toContain("@container country-identity (width < 40rem)");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
    expect(css).not.toContain("data-country-personality=");
    expect(wiki).toContain("scroll-margin-block-start");
    expect(wiki).toContain("@media (forced-colors: active)");
  });
});
