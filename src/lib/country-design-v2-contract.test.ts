import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Country Design V2 integration contract", () => {
  it("keeps V1 public rendering available until design_version 2 is published", () => {
    const country = source("src/routes/countries/$code.tsx");
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    expect(country).toContain("isPublishedV2");
    expect(country).toContain("<CountryIdentityHero");
    expect(country).toContain("<CountryDesignV2Hero");
    expect(wiki).toContain("isPublishedV2");
    expect(wiki).toContain("<CountryIdentityHero");
    expect(wiki).toContain("<CountryDesignV2Hero");
  });

  it("uses a single V2 page surface while sections choose layout and emphasis", () => {
    const css = source("src/country-design-v2.css");
    const sections = source("src/components/country/CountryCustomSections.tsx");
    expect(css).toContain('data-country-surface="glass"');
    expect(css).toContain('[data-country-section-layout="magazine"]');
    expect(css).toContain('[data-country-section-emphasis="accent"]');
    expect(sections).toContain("data-country-section-layout");
    expect(sections).toContain("data-country-section-emphasis");
  });

  it("offers direct preview editing, saved designs, custom fonts and six content layouts", () => {
    const editor = source("src/components/mysolaris/modules/MySolarisDesignV2Module.tsx");
    expect(editor).toContain('data-country-design-editor="true"');
    expect(editor).toContain("Save your own design");
    expect(editor).toContain("Upload custom font");
    expect(editor).toContain("Suggest from flag");
    expect(editor).toContain("COUNTRY_CONTENT_LAYOUT_OPTIONS");
  });

  it("inherits the page layout and accessibility-normalizes the live preview", () => {
    const editor = source("src/components/mysolaris/modules/MySolarisDesignV2Module.tsx");
    const country = source("src/routes/countries/$code.tsx");
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    expect(editor).toContain("const previewDesign = normalizeCountryDesignV2(design)");
    expect(editor).toContain("defaultLayout={previewDesign.content.defaultLayout}");
    expect(country).toContain("defaultLayout={publishedDesign?.content.defaultLayout}");
    expect(wiki).toContain("defaultLayout={publishedDesign?.content.defaultLayout}");
  });

  it("keeps the V2 root as a canvas and restores the real liquid-glass engine", () => {
    const css = source("src/country-design-v2.css");
    const hero = source("src/components/country/CountryDesignV2Hero.tsx");
    expect(css).toContain("V2 is a page canvas, not another card");
    expect(css).toContain("padding: 0;");
    expect(css).toContain("border-radius: 0;");
    expect(hero).toContain('import("@/vendor/liquid-glass/GlassMaterial")');
    expect(hero).toContain("country-v2-liquid-glass-material");
    expect(hero).toContain("data-liquid-glass");
  });

  it("does not inject anniversary notice cards into unrelated pages", () => {
    const anniversary = source("src/components/SolarisAnniversaryCelebration.tsx");
    expect(anniversary).not.toContain("solaris-anniversary-season-notice");
    expect(anniversary).not.toContain("solaris-anniversary-context");
  });

  it("retains accessible reorder controls alongside drag and drop", () => {
    const editor = source("src/components/mysolaris/modules/MySolarisPageMediaModule.tsx");
    expect(editor).toContain('aria-label="Drag to reorder section"');
    expect(editor).toContain('aria-label="Move section up"');
    expect(editor).toContain('aria-label="Move section down"');
  });
});
