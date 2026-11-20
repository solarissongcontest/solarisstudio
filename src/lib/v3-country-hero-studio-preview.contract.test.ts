import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const preview = readFileSync("src/components/mysolaris/CountryHeroStudioPreview.tsx", "utf8");
const editor = readFileSync("src/components/mysolaris/modules/MySolarisDesignV2Module.tsx", "utf8");
const hero = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");
const css = readFileSync("src/styles/v3-country-hero-studio-preview.css", "utf8");

describe("MySolaris Country Hero Studio safe first slice", () => {
  it("provides three distinct presentation previews from the existing country design", () => {
    expect(preview).toContain('"app" | "mobile-web" | "desktop"');
    expect(preview).toContain('variant.id === experience');
    expect(preview).toContain("design.background.imageUrl");
    expect(preview).toContain("design.background.positionX / 100");
    expect(preview).toContain("focalPoint={focus}");
    expect(preview).toContain('headingLevel={2}');
    expect(css).toContain('[data-experience="mobile-web"]');
    expect(css).toContain('[data-experience="desktop"]');
  });
  it("mounts the preview in existing authorized MySolaris Country designer without adding a competing writer", () => {
    expect(editor).toContain("<CountryHeroStudioPreview");
    expect(editor).toContain("Country Hero Studio · V3 preview");
    expect(preview).not.toContain("uploadVerifiedFile");
    expect(preview).not.toContain(".from(");
    expect(preview).not.toContain("mutateAsync");
    expect(preview).toContain("this does not publish a V3 hero");
    expect(preview).toContain('URL.createObjectURL(file)');
    expect(preview).toContain('URL.revokeObjectURL(url)');
    expect(preview).toContain('type="range"');
    expect(preview).toContain('type="file"');
    expect(preview).toContain('priority={false}');
    expect(hero).toContain('const Heading = headingLevel === 2 ? "h2" : "h1"');
  });
  it("preserves full flag ratio and a calm fade into ordinary sections", () => {
    expect(css).toContain("aspect-ratio: 3 / 2");
    expect(preview).toContain("Country");
    expect(preview).toContain("World");
  });
});
