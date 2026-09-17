import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wiki = readFileSync(new URL("./country-wiki-v7.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("./components/CountryPersonalityStyles.tsx", import.meta.url), "utf8");

describe("Terra Solaris Wiki V7", () => {
  it("loads the article-first Wiki correction after the production personality bridge", () => {
    expect(styles).toContain('import wikiV7 from "@/country-wiki-v7.css?inline"');
    expect(styles.indexOf("\n  wikiV7,")).toBeGreaterThan(styles.indexOf("\n  productionBridge,"));
  });

  it("keeps the Wiki hero compact regardless of the country dashboard personality", () => {
    expect(wiki).toContain(".wiki-public-hero {");
    expect(wiki).toContain("min-block-size: 0 !important;");
    expect(wiki).toContain("font-size: clamp(2rem, 4.5vw, 4.25rem) !important;");
    expect(wiki).toContain("The article must begin before the user forgets why they");
  });

  it("does not use negative mobile reading-grid margins or personality-specific giant canvases", () => {
    expect(wiki).toContain("margin: 1rem 0 0 !important;");
    expect(wiki).toContain("margin: .9rem 0 0 !important;");
    expect(wiki).not.toContain("margin-inline: -.75rem");
    expect(wiki).not.toContain("min-height: 300px");
  });

  it("uses one stable responsive reading architecture", () => {
    expect(wiki).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(wiki).toContain("grid-template-columns: minmax(0, 1fr) clamp(16rem, 22vw, 19rem) !important;");
    expect(wiki).toContain("grid-template-columns: clamp(11rem, 13vw, 14rem) minmax(34rem, 1fr) clamp(17rem, 20vw, 20rem) !important;");
    expect(wiki).toContain("@media (max-width: 767px)");
    expect(wiki).toContain("@media (max-width: 359px)");
  });

  it("keeps long-form reading transparent and personality influence restrained", () => {
    expect(wiki).toContain("background: transparent !important;");
    expect(wiki).toContain("--wiki-copy: min(72ch, 100%)");
    expect(wiki).toContain("font-family: Georgia, \"Times New Roman\", serif");
    expect(wiki).toContain("Personality is now editorial seasoning, not a different app per country");
    expect(wiki).toContain("Glass Wiki inherits only the infobox material");
  });

  it("protects flags, data tables, media and mobile controls from overflow", () => {
    expect(wiki).toContain("object-fit: contain !important;");
    expect(wiki).toContain("max-inline-size: 100% !important;");
    expect(wiki).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important;");
    expect(wiki).toContain("position: sticky;");
    expect(wiki).toContain("backdrop-filter: blur(16px) saturate(130%)");
  });

  it("has a print mode that produces a document rather than an app screenshot", () => {
    expect(wiki).toContain("@media print");
    expect(wiki).toContain("background: white !important;");
    expect(wiki).toContain("color: black !important;");
    expect(wiki).toContain("float: right;");
  });
});
