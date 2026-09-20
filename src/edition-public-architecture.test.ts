import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/editions/$slug.tsx", "utf8");
const css = readFileSync("src/edition-public-v5.css", "utf8");
const panel = readFileSync("src/components/EditionPublicDesignPanel.tsx", "utf8");
const primitives = readFileSync("src/components/edition/EditionPublicPrimitives.tsx", "utf8");
const liquidGlass = readFileSync("src/components/LiquidGlassBackdrop.tsx", "utf8");

describe("edition public page architecture", () => {
  it("keeps results behind the final publication gate", () => {
    expect(route).toContain("grandFinalPublication?.results");
    expect(route).toContain("grandFinalPublication?.jury_results");
    expect(route).toContain("grandFinalPublication?.televote_results");
    expect(route).toContain("usePublicEditionParticipants");
  });

  it("uses semantic edition primitives instead of a generic outer card", () => {
    expect(route).toContain("<EditionHero");
    expect(route).toContain("<EditionNavigation");
    expect(route).toContain("<EditionQuickFacts");
    expect(route).toContain('className="edition-public-page"');
    expect(css).not.toContain(".edition-public-page::before");
  });

  it("has mobile, reduced-motion, contrast and glass fallbacks", () => {
    expect(css).toContain("@media (max-width: 22.5rem)");
    expect(css).toContain("@container (max-width: 47.99rem)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("@supports not (backdrop-filter: blur(1px))");
  });

  it("mounts the appearance editor on the canonical route with device previews", () => {
    expect(panel).toContain("(?:design|edition-theme)");
    expect(panel).toContain('"desktop" | "tablet" | "mobile"');
    expect(panel).toContain("publicFocalX");
    expect(panel).toContain("publicFocalY");
    expect(panel).toContain("edition.artwork_url ?? edition.logo");
  });

  it("keeps inset artwork aligned with rounded hero geometry", () => {
    expect(css).toContain("border-radius: calc(var(--ed-radius) * .52)");
  });

  it("keeps artwork and logo as distinct hero roles and glass out of content panels", () => {
    expect(route).toContain("artwork={edition.artwork_url ?? null}");
    expect(route).toContain("logo={edition.logo ?? null}");
    expect(primitives).toContain('data-has-logo={logo ? "true" : "false"}');
    expect(css).toContain(":where(.glass, .data-panel):not(.public-current-status)");
    expect(css).toContain("backdrop-filter: none !important");
  });

  it("uses measured lens-map Liquid Glass for the Edition hero and navigation", () => {
    expect(route).toContain("resolveEditionPublicStyle");
    expect(route).toContain("liquidGlass={liquidGlass}");
    expect(primitives).toContain('<LiquidGlassBackdrop');
    expect(primitives).toContain('variant="hero"');
    expect(primitives).toContain('variant="control"');
    expect(liquidGlass).toContain('import("@/vendor/liquid-glass/GlassMaterial")');
    expect(liquidGlass).toContain("dispersion");
    expect(css).toContain(".edition-hero-liquid-glass");
    expect(css).toContain(".edition-navigation-liquid-glass");
  });
});
