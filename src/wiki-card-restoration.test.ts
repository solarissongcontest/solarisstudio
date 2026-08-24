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

  it("uses Classica Crastao for major headlines and Gotham for everything else", () => {
    expect(restoration).toContain('--wiki-headline-font: "Classica Crastao", Georgia, serif;');
    expect(restoration).toContain('--wiki-body-font: "Gotham", ui-sans-serif, system-ui, sans-serif;');
    expect(restoration).toContain("font-family: var(--wiki-headline-font) !important;");
    expect(restoration).toContain("font-family: var(--wiki-body-font) !important;");
    expect(restoration).not.toContain("Sora");
    expect(restoration).not.toContain("Manrope");
  });

  it("keeps stat values and utility headings in Gotham instead of the headline face", () => {
    expect(restoration).toContain(".wiki-record-strip dd,");
    expect(restoration).toContain(".wiki-sheet-panel > header h2");
  });

  it("restores compact Wiki stat cards and personality-specific section treatments", () => {
    expect(restoration).toContain(".wiki-record-strip > div {");
    expect(restoration).toContain('[data-country-hero-layout="broadcast"]');
    expect(restoration).toContain('[data-country-hero-layout="glass-card"]');
    expect(restoration).toContain('[data-country-hero-layout="heritage"]');
  });
});
