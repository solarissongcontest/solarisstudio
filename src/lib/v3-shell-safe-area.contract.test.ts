import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 shell physical safe-area contract", () => {
  const css = source("src/styles/v3-navigation-fixed-geometry.css");

  it("owns the top system exclusion zone centrally", () => {
    expect(css).toContain("--v3-effective-safe-top: max(env(safe-area-inset-top, 0px), var(--v3-safe-top-floor))");
    expect(css).toContain("--v3-top-comfort: 7px");
    expect(css).toMatch(/\.v3-top-context[\s\S]*var\(--v3-effective-safe-top\)[\s\S]*var\(--v3-top-comfort\)/);
    expect(css).toContain("@media (display-mode: standalone) and (max-width: 1023px)");
    expect(css).toContain("--v3-safe-top-floor: 20px");
  });

  it("owns floating-navigation end clearance at the shell instead of V3Screen", () => {
    expect(css).toContain("[data-solaris-v3].v3-foundation-shell > div:first-child");
    expect(css).toContain("var(--v3-bottom-obstruction, 96px)");
    expect(css).toContain("--v3-bottom-comfort: 18px");
    expect(css).toContain("padding-bottom: var(--v3-page-end-space) !important");
    expect(css).not.toContain("var(--v3-bottom-obstruction, 116px) + 16px");
  });

  it("removes hidden keyboard chrome from sequential focus and avoids desktop dead space", () => {
    expect(css).toMatch(/data-solaris-keyboard-open[\s\S]*visibility: hidden/);
    expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*v3-foundation-shell > div:first-child[\s\S]*padding-bottom: 0/);
  });
});
