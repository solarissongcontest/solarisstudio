import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const styles = source("src/components/CountryPersonalityStyles.tsx");
const css = source("src/country-personalities-v6.css");
const layout = source("src/country-personalities-v6-layout.css");

const rebuilt = [
  "water-drop",
  "heritage",
  "monument",
  "passport",
  "split",
  "duotone",
  "panorama",
];

describe("country personality V6 silhouettes", () => {
  it("loads V6 after V5 and keeps the structural parity layer last", () => {
    expect(styles).toContain('import silhouetteStyles from "@/country-personalities-v6.css?inline"');
    expect(styles).toContain('import silhouetteLayoutStyles from "@/country-personalities-v6-layout.css?inline"');
    expect(styles.indexOf("{silhouetteStyles}")).toBeGreaterThan(styles.indexOf("{artDirectionStyles}"));
    expect(styles.indexOf("{silhouetteLayoutStyles}")).toBeGreaterThan(styles.indexOf("{silhouetteStyles}"));
  });

  it("rebuilds all seven weak personalities as explicit final selectors", () => {
    for (const personality of rebuilt) {
      expect(css).toContain(`data-country-hero-layout="${personality}"`);
      expect(layout).toContain(`data-preview-layout="${personality}"`);
    }
  });

  it("makes the entire Water Drop hero an asymmetric liquid silhouette", () => {
    expect(css).toContain('[data-country-hero-layout="water-drop"] .country-public-hero');
    expect(css).toContain("border-radius: 46% 13% 42% 20% / 28% 48% 52% 72% !important;");
    expect(css).toContain("backdrop-filter: blur(18px) saturate(155%) !important;");
    expect(css).toContain("grid-template-columns: max-content max-content !important;");
    expect(layout).toContain('.personality-miniature[data-preview-layout="water-drop"]');
  });

  it("keeps Traditional formal, small-flagged and explicitly non-liquid", () => {
    expect(css).toContain('[data-country-hero-layout="heritage"] .country-public-hero');
    expect(css).toContain("border-radius: 6px !important;");
    expect(css).toContain("width: 72px !important;");
    expect(css).toContain("height: 48px !important;");
    expect(layout).toContain('content: "TRADITION" !important;');
  });

  it("keeps Luxurious symmetrical and ceremonial", () => {
    expect(css).toContain('[data-country-hero-layout="monument"] .country-public-hero');
    expect(css).toContain("text-align: center !important;");
    expect(css).toContain("◆  TERRA SOLARIS  ◆");
    expect(layout).toContain("◆ LUXURIOUS ◆");
  });

  it("makes Passport a document with one small flag and one entry stamp", () => {
    expect(css).toContain('[data-country-hero-layout="passport"] .country-public-hero');
    expect(css).toContain('content: "TS\\A ENTRY" !important;');
    expect(css).toContain("border: 1px dashed rgb(var(--solaris-accent) / .43) !important;");
  });

  it("keeps Split and Duotone visibly different", () => {
    expect(css).toContain('[data-country-hero-layout="split"] .country-public-hero');
    expect(css).toContain("height: 100px !important;");
    expect(css).toContain('[data-country-hero-layout="duotone"] .country-public-hero');
    expect(css).toContain("clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%) !important;");
  });

  it("makes Panorama a low cinematic horizon instead of a generic flag card", () => {
    expect(css).toContain('[data-country-hero-layout="panorama"] .country-public-hero');
    expect(css).toContain("height: 92px !important;");
    expect(css).toContain("bottom: 94px !important;");
  });

  it("prevents the generic desktop wrapper from restoring the same skeleton", () => {
    expect(layout).toContain("display: block !important;");
    for (const personality of rebuilt) {
      expect(layout).toContain(`[data-country-hero-layout="${personality}"]`);
    }
  });

  it("keeps typography on Gotham and Classica only", () => {
    expect(css).toContain('"Gotham"');
    expect(css).toContain('"Classica Crastao"');
    expect(layout).toContain('"Gotham"');
    expect(css).not.toContain("Sora");
    expect(css).not.toContain("Manrope");
  });
});
