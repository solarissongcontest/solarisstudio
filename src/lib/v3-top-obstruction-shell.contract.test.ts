import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solaris Studio V3 shared top obstruction", () => {
  const responsive = source("src/styles/v3-responsive-shell.css");
  const foundations = source("src/styles/v3-foundations.css");

  it("owns one safe-area-aware top-context obstruction authority", () => {
    expect(responsive).toContain(
      "--v3-top-context-obstruction: calc(3.25rem + env(safe-area-inset-top))",
    );
    expect(responsive).toContain(
      "--v3-shell-top-obstruction: calc(var(--v3-top-context-obstruction) + 0.5rem)",
    );
    expect(responsive).toContain("min-height: var(--v3-top-context-obstruction)");
  });

  it("preserves the foundation 44px control target while compacting surrounding chrome", () => {
    expect(foundations).toContain(".v3-icon-button");
    expect(foundations).toContain("width: 2.75rem");
    expect(foundations).toContain("height: 2.75rem");
    expect(responsive).toContain("align-items: center");
    expect(responsive).toContain("calc(env(safe-area-inset-top) + 0.25rem)");
  });

  it("keeps anchors and keyboard-focus targets below active sticky chrome", () => {
    expect(responsive).toContain(
      "scroll-margin-block-start: var(--v3-shell-top-obstruction)",
    );
    expect(responsive).toContain("a[href]");
    expect(responsive).toContain("button");
    expect(responsive).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("composes desktop navigation from the same top-context authority", () => {
    const desktopStart = responsive.indexOf("@media (min-width: 1024px)");
    const wideStart = responsive.indexOf("@media (min-width: 1440px)");
    const desktop = responsive.slice(desktopStart, wideStart);

    expect(desktopStart).toBeGreaterThanOrEqual(0);
    expect(wideStart).toBeGreaterThan(desktopStart);
    expect(desktop).toContain(
      "--v3-shell-top-obstruction: calc(var(--v3-top-context-obstruction) + 4.5rem)",
    );
    expect(desktop).toContain("top: var(--v3-top-context-obstruction)");
    expect(desktop).not.toContain("top: calc(3.25rem + env(safe-area-inset-top))");
  });

  it("keeps reduced-transparency fallbacks without duplicating top-context ownership", () => {
    const foundationReduced = foundations.slice(
      foundations.indexOf("@media (prefers-reduced-transparency: reduce)"),
    );
    const responsiveReduced = responsive.slice(
      responsive.indexOf("@media (prefers-reduced-transparency: reduce)"),
    );

    expect(foundationReduced).toContain(".v3-top-context");
    expect(foundationReduced).toContain("backdrop-filter: none");
    expect(responsiveReduced).toContain(".v3-desktop-primary-nav");
    expect(responsiveReduced).toContain("backdrop-filter: none");
    expect(responsiveReduced).not.toContain(".v3-top-context");
  });
});
