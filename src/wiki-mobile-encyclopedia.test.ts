import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobile = readFileSync(new URL("./wiki-mobile-encyclopedia.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("./components/CountryPersonalityStyles.tsx", import.meta.url), "utf8");

describe("mobile Wiki encyclopedia layout", () => {
  it("loads the mobile Wiki layer after desktop/personality restoration", () => {
    expect(styles).toContain('import wikiMobileStyles from "@/wiki-mobile-encyclopedia.css?inline";');
    expect(styles.indexOf("{wikiMobileStyles}")).toBeGreaterThan(styles.indexOf("{wikiRestorationStyles}"));
  });

  it("keeps the mobile masthead compact without stripping personality artwork", () => {
    expect(mobile).toContain('.wiki-canvas .country-wiki-header {');
    expect(mobile).toContain("min-height: 0 !important;");
    expect(mobile).toContain("border-radius: .85rem !important;");
    expect(mobile).toContain("width: 3.8rem !important;");
    expect(mobile).not.toContain('.country-wiki-header .country-personality-signature,\n  body[data-entity-theme="country"] .wiki-canvas .country-wiki-header .country-hero-background-flag');
  });

  it("restores one compact card per mobile Wiki section", () => {
    expect(mobile).toContain('body[data-entity-theme="country"][data-country-hero-layout] .wiki-canvas :is(.wiki-introduction, .wiki-article-section)');
    expect(mobile).toContain("border: 1px solid rgb(var(--solaris-accent) / .15) !important;");
    expect(mobile).toContain("border-radius: .82rem !important;");
    expect(mobile).toContain("gap: .55rem !important;");
  });

  it("keeps Introduction visible but compact", () => {
    expect(mobile).toContain('.wiki-canvas .wiki-introduction h2');
    expect(mobile).toContain("font-size: 1.02rem !important;");
    expect(mobile).toContain("padding: .88rem .9rem .94rem !important;");
  });

  it("keeps section cards much smaller than the old slabs", () => {
    expect(mobile).toContain("min-height: 3rem !important;");
    expect(mobile).toContain("padding: .66rem .78rem !important;");
    expect(mobile).toContain("font-size: .94rem !important;");
  });

  it("preserves personality-specific mobile card treatments", () => {
    expect(mobile).toContain('[data-country-hero-layout="editorial"]');
    expect(mobile).toContain('[data-country-hero-layout="broadcast"]');
    expect(mobile).toContain('[data-country-hero-layout="glass-card"]');
    expect(mobile).toContain('[data-country-hero-layout="passport"]');
  });

  it("keeps mobile article headings and reading UI in Gotham", () => {
    expect(mobile).toContain('.wiki-canvas .wiki-article-section > summary h2');
    expect(mobile).toContain('font-family: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
  });
});
