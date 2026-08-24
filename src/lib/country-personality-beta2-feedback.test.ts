import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const feedback = source("src/country-personality-feedback.css");
const styles = source("src/components/CountryPersonalityStyles.tsx");

describe("Beta 2 country personality feedback", () => {
  it("loads the feedback layer after Wiki/mobile restoration so final public and preview styling agrees", () => {
    expect(styles).toContain('import feedbackStyles from "@/country-personality-feedback.css?inline"');
    expect(styles.indexOf("{feedbackStyles}")).toBeGreaterThan(styles.indexOf("{wikiMobileStyles}"));
  });

  it("prevents hero preview selectors from blowing up the small personality miniatures", () => {
    expect(feedback).toContain('.personality-miniature[data-preview-layout] {');
    expect(feedback).toContain('height: 4.5rem !important;');
    expect(feedback).toContain('min-height: 4.5rem !important;');
    expect(feedback).toContain('max-height: 4.5rem !important;');
  });

  it("gives every picker miniature a layout-specific composition", () => {
    for (const layout of [
      "classic",
      "editorial",
      "minimal",
      "flag-focus",
      "poster",
      "split",
      "spotlight",
      "broadcast",
      "panorama",
      "monument",
      "glass-card",
      "newspaper",
      "ribbon",
      "duotone",
      "passport",
      "horizon",
      "heritage",
    ]) {
      expect(feedback).toContain(`.personality-miniature[data-preview-layout="${layout}"]`);
    }
  });

  it("answers the strongest missing-style request with an explicitly luxurious Monument treatment", () => {
    expect(feedback).toContain('Monument is the elegant/luxury direction Beta 2 asked for');
    expect(feedback).toContain('content: "LUXURY";');
    expect(feedback).toContain('[data-country-hero-layout="monument"]');
    expect(feedback).toContain('font-family: "Classica Crastao", Georgia, serif !important;');
  });

  it("makes already-existing requested concepts visibly stronger instead of adding duplicates", () => {
    for (const layout of ["flag-focus", "minimal", "broadcast", "glass-card"]) {
      expect(feedback).toContain(`data-country-hero-layout="${layout}"`);
      expect(feedback).toContain(`data-preview-layout="${layout}"`);
    }
    expect(feedback).toContain('opacity: .3 !important;');
    expect(feedback).toContain('content: "ON AIR" !important;');
  });

  it("directly addresses Passport being plain and Heritage being the traditional/cultural direction", () => {
    expect(feedback).toContain('Passport: directly answers the "boring and plain" Beta comment.');
    expect(feedback).toContain('content: "TS\\\\A ENTRY VISA" !important;');
    expect(feedback).toContain('Heritage: make the cultural/traditional option unmistakable');
  });

  it("keeps Gotham for UI/readability and Classica Crastao for genuinely large display identities", () => {
    expect(feedback).toContain('font-family: "Gotham", ui-sans-serif, system-ui, sans-serif !important;');
    expect(feedback).toContain('font-family: "Classica Crastao", Georgia, serif !important;');
    expect(feedback).not.toContain('"Sora"');
    expect(feedback).not.toContain('"Manrope"');
  });
});
