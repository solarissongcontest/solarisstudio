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
    expect(mobile).toContain(".country-wiki-header {");
    expect(mobile).toContain("min-height: 0 !important;");
    expect(mobile).toContain('width: 4.5rem !important;');
  });

  it("uses one mobile article sheet with divider sections rather than stacked giant cards", () => {
    expect(mobile).toContain(".wiki-article-surface {");
    expect(mobile).toContain("overflow: hidden !important;");
    expect(mobile).toContain(".wiki-introduction,\n  .wiki-article-section,");
    expect(mobile).toContain("border-radius: 0 !important;");
    expect(mobile).toContain(".wiki-article-section {\n    border-top: 1px solid");
  });

  it("keeps mobile article headings in Gotham and reserves the big country headline for Classica", () => {
    expect(mobile).toContain('.wiki-article-section > summary h2');
    expect(mobile).toContain('font-family: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
    expect(mobile).toContain(".country-wiki-header .country-hero-title {");
  });

  it("makes Contents and Quick facts inline article utilities rather than a floating card", () => {
    expect(mobile).toContain(".wiki-mobile-tools {");
    expect(mobile).toContain("position: static !important;");
    expect(mobile).toContain(".wiki-mobile-toolbar {");
    expect(mobile).toContain("border-radius: 0 !important;");
    expect(mobile).toContain("box-shadow: none !important;");
  });
});
