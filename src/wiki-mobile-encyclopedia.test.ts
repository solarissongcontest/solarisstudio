import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobile = readFileSync(new URL("./wiki-mobile-encyclopedia.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("./components/CountryPersonalityStyles.tsx", import.meta.url), "utf8");

describe("mobile Wiki encyclopedia layout", () => {
  it("loads the mobile Wiki layer after desktop/personality restoration", () => {
    expect(styles).toContain('import wikiMobileStyles from "@/wiki-mobile-encyclopedia.css?inline";');
    expect(styles.indexOf("{wikiMobileStyles}")).toBeGreaterThan(styles.indexOf("{wikiRestorationStyles}"));
  });

  it("keeps the mobile masthead compact instead of poster-sized", () => {
    expect(mobile).toContain('.wiki-canvas .country-wiki-header {');
    expect(mobile).toContain("min-height: 0 !important;");
    expect(mobile).toContain("width: 4rem !important;");
    expect(mobile).toContain(".country-personality-signature,");
    expect(mobile).toContain("display: none !important;");
  });

  it("neutralises personality card geometry with a selector strong enough to win on mobile", () => {
    expect(mobile).toContain('body[data-entity-theme="country"][data-country-hero-layout] .wiki-canvas :is(.wiki-introduction, .wiki-article-section)');
    expect(mobile).toContain("border: 0 !important;");
    expect(mobile).toContain("border-radius: 0 !important;");
    expect(mobile).toContain("background: transparent !important;");
    expect(mobile).toContain("box-shadow: none !important;");
  });

  it("renders sections as compact article dividers rather than stacked cards", () => {
    expect(mobile).toContain('.wiki-canvas .wiki-article-section {\n    border-top: 1px solid');
    expect(mobile).toContain("min-height: 3rem !important;");
    expect(mobile).toContain("padding: .62rem .08rem !important;");
  });

  it("keeps mobile article headings and reading UI in Gotham", () => {
    expect(mobile).toContain('.wiki-canvas .wiki-article-section > summary h2');
    expect(mobile).toContain('font-family: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
    expect(mobile).toContain("font-size: .98rem !important;");
  });

  it("makes Contents and Quick facts inline article utilities rather than a floating card", () => {
    expect(mobile).toContain(".wiki-mobile-tools {");
    expect(mobile).toContain("position: static !important;");
    expect(mobile).toContain(".wiki-mobile-toolbar {");
    expect(mobile).toContain("border-radius: 0 !important;");
    expect(mobile).toContain("box-shadow: none !important;");
  });
});
