import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/editions/$slug.tsx", "utf8");
const css = readFileSync("src/edition-public-v5.css", "utf8");
const panel = readFileSync("src/components/EditionPublicDesignPanel.tsx", "utf8");

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
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("@supports not (backdrop-filter: blur(1px))");
  });

  it("mounts the appearance editor on the canonical route with device previews", () => {
    expect(panel).toContain("(?:design|edition-theme)");
    expect(panel).toContain('"desktop" | "tablet" | "mobile"');
    expect(panel).toContain("publicFocalX");
    expect(panel).toContain("publicFocalY");
  });
});
