import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("default page colour system", () => {
  const harmony = read("src/colour-harmony.css");
  const rgb = (declarations: string, name: string) => {
    const match = declarations.match(new RegExp(`--solaris-${name}:\\s*([0-9 ]+)`));
    return match?.[1].trim().split(/\s+/).map(Number) ?? [];
  };
  const distance = (first: number[], second: number[]) =>
    Math.hypot(...first.map((value, index) => value - second[index]));
  const luminance = (colour: number[]) => {
    const channel = (value: number) => {
      const normal = value / 255;
      return normal <= .04045 ? normal / 12.92 : ((normal + .055) / 1.055) ** 2.4;
    };
    return .2126 * channel(colour[0]) + .7152 * channel(colour[1]) + .0722 * channel(colour[2]);
  };

  it("gives every public page family three coordinated background colours", () => {
    const blocks = [...harmony.matchAll(/body\[data-solaris-family="([^"]+)"\]\s*\{([^}]+)\}/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(20);

    for (const [, , declarations] of blocks) {
      expect(declarations).toContain("--solaris-bg-primary:");
      expect(declarations).toContain("--solaris-bg-secondary:");
      expect(declarations).toContain("--solaris-bg-tertiary:");
      expect(declarations).toContain("--solaris-accent:");

      const primary = rgb(declarations, "bg-primary");
      const secondary = rgb(declarations, "bg-secondary");
      const tertiary = rgb(declarations, "bg-tertiary");
      const accent = rgb(declarations, "accent");
      expect(distance(primary, secondary)).toBeGreaterThan(35);
      expect(distance(secondary, tertiary)).toBeGreaterThan(35);
      expect(luminance(accent)).toBeGreaterThan(.3);
    }
  });

  it("uses the rebuilt Wiki Library surfaces instead of the old brown palette", () => {
    const wiki = read("src/routes/wiki/index.tsx");
    expect(harmony).toContain("--solaris-bg-primary: 59 126 166");
    expect(harmony).not.toContain("--solaris-bg-primary: 224 171 72");
    expect(wiki).toContain('className="directory-page-hero wiki-library-hero"');
    expect(wiki).toContain("directory-country-card");
    expect(wiki).not.toContain("wandering into a 404");
  });

  it("uses the same premium directory treatment for the country library", () => {
    const countries = read("src/routes/countries/index.tsx");
    expect(countries).toContain('className="directory-page-hero countries-library-hero"');
    expect(countries).toContain("directory-page-filter");
    expect(countries).toContain("directory-country-card");
  });

  it("harmonises the remaining public editorial cards and headers", () => {
    const editions = read("src/routes/editions/index.tsx");
    const shows = read("src/routes/shows/index.tsx");
    const tools = read("src/routes/tools/index.tsx");
    const guide = read("src/components/GuideFAQ.tsx");

    expect(harmony).toContain(".page-header:not(.directory-page-hero)::after");
    expect(editions).toContain("solaris-family-card");
    expect(editions).not.toContain("rgba(10,30,58,.97)");
    expect(shows).toContain("solaris-family-card-overlay");
    expect(tools).toContain("solaris-family-card");
    expect(guide).toContain('className="data-panel rounded-2xl p-4 sm:p-5"');
  });
});
