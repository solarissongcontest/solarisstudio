import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preview = readFileSync("src/components/mysolaris/CountryHeroStudioPreview.tsx", "utf8");
const editor = readFileSync("src/components/mysolaris/modules/MySolarisDesignV2Module.tsx", "utf8");
const shared = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");
const css = readFileSync("src/styles/v3-country-hero-studio-preview.css", "utf8");

describe("MySolaris three-experience Country Hero Studio preview", () => {
  it("renders actual V2 image or private local image in three distinct preview modes", () => {
    expect(preview).toContain('"app" | "mobile-web" | "desktop"');
    expect(preview).toContain("design.background.imageUrl");
    expect(preview).toContain("focalPoint={focus}");
    expect(preview).toContain("draftFocus");
    expect(preview).toContain('headingLevel={2}');
    expect(css).toContain('[data-experience="mobile-web"]');
    expect(css).toContain('[data-experience="desktop"]');
  });
  it("keeps the draft strictly private and does not invent V3 publish controls", () => {
    expect(editor).toContain("<CountryHeroStudioPreview");
    expect(editor).toContain('title="Country Hero Studio"');
    expect(preview).toContain("this does not publish a V3 hero");
    expect(preview).toContain("URL.createObjectURL(file)");
    expect(preview).toContain("URL.revokeObjectURL(url)");
    expect(preview).toContain('type="range"');
    expect(preview).toContain('type="file"');
    expect(preview).toContain("priority={false}");
    expect(preview).not.toContain("uploadVerifiedFile");
    expect(preview).not.toContain(".from(");
    expect(preview).not.toContain("mutateAsync");
    expect(shared).toContain('const Heading = headingLevel === 2 ? "h2" : "h1"');
  });
  it("retains a separate official 3:2 country flag", () => {
    expect(css).toContain("aspect-ratio: 3 / 2");
    expect(preview).toContain('className="country-hero-preview__flag"');
    expect(preview).toContain("flagImage");
  });
});
