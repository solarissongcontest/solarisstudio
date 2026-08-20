import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const visualTheme = source("src/lib/visual-theme.ts");
const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
const css = source("src/country-personalities.css");
const backgroundFlag = source("src/components/BackgroundFlag.tsx");
const migration = source("supabase/migrations/20260820160000_expand_country_page_personalities.sql");

const newLayouts = [
  "panorama",
  "monument",
  "glass-card",
  "newspaper",
  "ribbon",
  "duotone",
  "passport",
  "horizon",
];

describe("expanded country page personalities", () => {
  it("registers sixteen supported hero layouts in the client and database", () => {
    for (const layout of newLayouts) {
      expect(visualTheme).toContain(`| \"${layout}\"`);
      expect(visualTheme).toContain(`\"${layout}\",`);
      expect(migration).toContain(`'${layout}'`);
      expect(editor).toContain(`value: \"${layout}\"`);
    }
    expect(editor).toContain("Sixteen deliberately different header compositions");
  });

  it("uses a rectangular national flag treatment for split instead of the circular svg", () => {
    expect(backgroundFlag).toContain("--background-flag-image");
    expect(css).toContain('[data-country-hero-layout="split"]');
    expect(css).toContain(".country-hero-background-flag > svg");
    expect(css).toContain("display: none !important");
    expect(css).toContain("aspect-ratio: 3 / 2 !important");
    expect(editor).toContain("rectangular className=\"absolute right-5 top-1/2 w-[36%] -translate-y-1/2\"");
  });

  it("binds country and wiki headings to the configured main-text colour", () => {
    expect(css).toContain('.app-main :is(h1, h2, h3, h4, h5, h6)');
    expect(css).toContain("color: var(--foreground) !important");
    expect(editor).toContain("Main text now controls every country/Wiki heading");
  });
});
