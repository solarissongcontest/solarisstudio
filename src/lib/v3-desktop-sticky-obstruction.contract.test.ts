import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const responsiveShell = () => read("src/styles/v3-responsive-shell.css");
const topContext = () => read("src/styles/v3-top-context.css");

describe("Solaris Studio V3 desktop sticky obstruction contract", () => {
  it("composes desktop obstruction from the shared top-context authority", () => {
    const desktop = responsiveShell();
    const top = topContext();

    expect(top).toContain("--v3-top-context-obstruction");
    expect(desktop).toContain("--v3-secondary-sticky-obstruction: 4rem");
    expect(desktop).toContain("--v3-desktop-sticky-obstruction: calc(");
    expect(desktop).toContain("var(--v3-top-context-obstruction) +");
    expect(desktop).not.toContain("--v3-top-context-obstruction:");
  });

  it("positions desktop primary navigation from the same top-context token", () => {
    const css = responsiveShell();
    const desktopStart = css.indexOf("@media (min-width: 1024px)");
    const desktopEnd = css.indexOf("@media (min-width: 1440px)");
    const desktop = css.slice(desktopStart, desktopEnd);

    expect(desktopStart).toBeGreaterThanOrEqual(0);
    expect(desktopEnd).toBeGreaterThan(desktopStart);
    expect(desktop).toContain("top: var(--v3-top-context-obstruction)");
    expect(desktop).not.toContain("top: calc(3.25rem + env(safe-area-inset-top))");
  });

  it("keeps desktop anchor and focus recovery below both sticky layers", () => {
    const css = responsiveShell();

    expect(css).toContain("[data-solaris-v3] .v3-screen :where(");
    expect(css).toContain("scroll-margin-block-start: var(--v3-desktop-sticky-obstruction)");
    expect(css).toContain("a[href]");
    expect(css).toContain("button");
    expect(css).toContain("input");
    expect(css).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("remains a presentation-only shell contract", () => {
    const css = responsiveShell().toLowerCase();

    for (const forbidden of [
      "supabase",
      "fetch(",
      "localstorage",
      "sessionstorage",
      "date.now(",
      "jury",
      "televote",
      "confirmation",
    ]) {
      expect(css).not.toContain(forbidden);
    }
  });
});
