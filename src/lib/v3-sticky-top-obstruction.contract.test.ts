import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const responsiveShell = () => read("src/styles/v3-responsive-shell.css");

describe("Solaris Studio V3 sticky top obstruction contract", () => {
  it("owns one shared obstruction model for sticky top chrome", () => {
    const css = responsiveShell();

    expect(css).toContain("--v3-top-context-obstruction");
    expect(css).toContain("--v3-secondary-sticky-obstruction");
    expect(css).toContain("--v3-sticky-top-gap");
    expect(css).toContain("--v3-sticky-top-obstruction");
    expect(css).toContain("var(--v3-top-context-obstruction) +");
    expect(css).toContain("var(--v3-secondary-sticky-obstruction) +");
  });

  it("keeps anchor and keyboard focus targets below sticky chrome", () => {
    const css = responsiveShell();

    expect(css).toContain(":where([id], [data-scroll-anchor])");
    expect(css).toContain("scroll-margin-top: var(--v3-sticky-top-obstruction)");
    expect(css).toContain("a[href]");
    expect(css).toContain("button:not([disabled])");
    expect(css).toContain('input:not([type="hidden"]):not([disabled])');
    expect(css).toContain('[tabindex]:not([tabindex="-1"])');
    expect(css).toContain('[contenteditable]:not([contenteditable="false"])');
    expect(css).toMatch(/\):focus\s*\{[\s\S]*?scroll-margin-top:\s*var\(--v3-sticky-top-obstruction\)/);
  });

  it("stacks desktop primary navigation below the top context without a second magic offset", () => {
    const css = responsiveShell();
    const desktopStart = css.indexOf("@media (min-width: 1024px)");
    const desktopEnd = css.indexOf("@media (min-width: 1440px)");
    const desktop = css.slice(desktopStart, desktopEnd);

    expect(desktopStart).toBeGreaterThanOrEqual(0);
    expect(desktopEnd).toBeGreaterThan(desktopStart);
    expect(desktop).toContain("--v3-secondary-sticky-obstruction: 4rem");
    expect(desktop).toContain("top: var(--v3-top-context-obstruction)");
    expect(desktop).not.toContain("top: calc(3.25rem + env(safe-area-inset-top))");
  });

  it("keeps the contract presentation-only and independent of domain or network truth", () => {
    const css = responsiveShell();

    for (const forbidden of [
      "supabase",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "Date.now(",
      "jury",
      "televote",
      "confirmation",
    ]) {
      expect(css.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
