import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const styles = read("src/components/CountryPersonalityStyles.tsx");
const css = read("src/country-water-drop-v61.css");

describe("Water Drop V6.1", () => {
  it("loads the liquid refinement after the generic V6 layers", () => {
    expect(styles).toContain('import waterDropStyles from "@/country-water-drop-v61.css?inline"');
    expect(styles.indexOf("{waterDropStyles}")).toBeGreaterThan(styles.indexOf("{silhouetteLayoutStyles}"));
  });

  it("uses the proven irregular water-drop radius rather than the bean radius", () => {
    expect(css).toContain("border-radius: 38% 62% 47% 53% / 43% 73% 27% 57% !important;");
    expect(css).toContain("inset 18px 18px 22px");
    expect(css).toContain("inset -16px -18px 26px");
  });

  it("uses two small circular specular highlights", () => {
    expect(css).toContain("width: 31px !important;");
    expect(css).toContain("height: 31px !important;");
    expect(css).toContain("width: 12px !important;");
    expect(css).toContain("height: 12px !important;");
  });

  it("refracts the flag through the whole drop instead of creating a second blob", () => {
    expect(css).toContain("inset: -7% -8% -7% 0 !important;");
    expect(css).toContain("width: 112% !important;");
    expect(css).toContain("mask-image: linear-gradient(90deg, transparent 0 34%");
    expect(css).toContain("display: none !important;");
  });

  it("protects the text from the curved edge", () => {
    expect(css).toContain("padding: 58px 98px 34px 44px !important;");
    expect(css).toContain("max-width: 10.75rem !important;");
    expect(css).toContain("overflow-wrap: anywhere !important;");
  });

  it("keeps the picker thumbnail and mobile Wiki on the same drop silhouette", () => {
    expect(css).toContain('.personality-miniature[data-preview-layout="water-drop"]');
    expect(css).toContain(".wiki-public-hero");
    expect(css).toContain("min-height: 190px !important;");
  });

  it("does not reintroduce disallowed product fonts", () => {
    expect(css).not.toContain("Sora");
    expect(css).not.toContain("Manrope");
  });
});
