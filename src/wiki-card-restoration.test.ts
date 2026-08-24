import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const restoration = readFileSync(new URL("./wiki-card-restoration.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("./components/CountryPersonalityStyles.tsx", import.meta.url), "utf8");

describe("Wiki cards and typography", () => {
  it("loads the restoration layer after the canonical Wiki styles", () => {
    expect(styles).toContain('import wikiStyles from "@/country-wiki.css?inline";');
    expect(styles).toContain('import wikiRestorationStyles from "@/wiki-card-restoration.css?inline";');
    expect(styles.indexOf("{wikiRestorationStyles}")).toBeGreaterThan(styles.indexOf("{wikiStyles}"));
  });

  it("keeps the article column transparent and restores one card per major section", () => {
    expect(restoration).toContain(".wiki-article-surface {");
    expect(restoration).toContain("background: transparent !important;");
    expect(restoration).toContain(".wiki-introduction,\n.wiki-article-section {");
    expect(restoration).toContain("border-radius: 1.15rem !important;");
  });

  it("uses the original Solaris display and body font families", () => {
    expect(restoration).toContain('--wiki-display-font: "Sora", ui-sans-serif, system-ui, sans-serif;');
    expect(restoration).toContain('--wiki-body-font: "Manrope", ui-sans-serif, system-ui, sans-serif;');
    expect(restoration).toContain("font-family: var(--wiki-display-font) !important;");
    expect(restoration).toContain("font-family: var(--wiki-body-font) !important;");
  });

  it("restores compact Wiki stat cards and personality-specific section treatments", () => {
    expect(restoration).toContain(".wiki-record-strip > div {");
    expect(restoration).toContain('[data-country-hero-layout="broadcast"]');
    expect(restoration).toContain('[data-country-hero-layout="glass-card"]');
    expect(restoration).toContain('[data-country-hero-layout="heritage"]');
  });
});
