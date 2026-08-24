import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardTypography = readFileSync(new URL("./card-typography.css", import.meta.url), "utf8");
const wikiTypography = readFileSync(new URL("./wiki-card-restoration.css", import.meta.url), "utf8");
const themeEditor = readFileSync(new URL("./components/studio/ThemeEditorImpl.tsx", import.meta.url), "utf8");

describe("Solaris typography policy", () => {
  it("uses Gotham as the site-wide UI face and Classica Crastao for display headlines", () => {
    expect(cardTypography).toContain('--font-display: "Classica Crastao", Georgia, serif;');
    expect(cardTypography).toContain('--font-sans: "Gotham", ui-sans-serif, system-ui, sans-serif;');
    expect(cardTypography).toContain('font-family: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
    expect(cardTypography).toContain('.country-hero-title,');
    expect(cardTypography).toContain('font-family: "Classica Crastao", Georgia, serif !important;');
  });

  it("overrides legacy ThemeConfig font variables on rendered themed surfaces", () => {
    expect(cardTypography).toContain('[style*="--t-font-body"]');
    expect(cardTypography).toContain('--t-font-display: "Classica Crastao", Georgia, serif !important;');
    expect(cardTypography).toContain('--t-font-body: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
  });

  it("keeps Wiki reading, navigation, stats and metadata in Gotham", () => {
    expect(wikiTypography).toContain('--wiki-body-font: "Gotham", ui-sans-serif, system-ui, sans-serif;');
    expect(wikiTypography).toContain('.wiki-record-strip dd,');
    expect(wikiTypography).toContain('.wiki-infobox-identity h2,');
    expect(wikiTypography).not.toContain("Sora");
    expect(wikiTypography).not.toContain("Manrope");
  });

  it("does not expose edition font pickers that can reintroduce abandoned typography", () => {
    expect(themeEditor).not.toContain("FONT_OPTIONS");
    expect(themeEditor).not.toContain("<Select");
    expect(themeEditor).toContain('const SOLARIS_DISPLAY_FONT = "Classica Crastao";');
    expect(themeEditor).toContain('const SOLARIS_BODY_FONT = "Gotham";');
  });
});
