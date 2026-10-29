import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V3 canonical top system safe zone", () => {
  const metrics = source("src/components/app/AppChromeMetrics.tsx");
  const safeZone = source("src/styles/app-safe-zone.css");
  const responsive = source("src/styles/v3-responsive-shell.css");
  const focusedTask = source("src/styles/v3-focused-task-shell.css");
  const foundations = source("src/styles/v3-foundations.css");

  it("centralizes platform safe-area aliases and the iOS standalone defensive marker", () => {
    expect(metrics).toContain("data-solaris-ios-standalone");
    expect(metrics).toContain("env(safe-area-inset-top, 0px)");
    expect(safeZone).toContain("--solaris-system-safe-top");
    expect(safeZone).toContain("--solaris-safe-content-top");
    expect(safeZone).toContain("--solaris-ios-standalone-min-top");
    expect(safeZone).toContain("max(");
    expect(safeZone).toContain("@media (orientation: landscape)");
  });

  it("keeps installed/native and browser mobile chrome below the shared boundary", () => {
    expect(safeZone).toContain("html[data-solaris-app] .solaris-app-toolbar");
    expect(safeZone).toContain("padding-top: var(--solaris-safe-content-top)");
    expect(safeZone).toContain("html[data-solaris-app] .solaris-app-offline");
    expect(safeZone).toContain("html[data-solaris-app] .solaris-app-tabbar");
    expect(safeZone).toContain('html:not([data-solaris-app]) .site-nav');
  });

  it("gives V3 one safe-area-aware top obstruction authority", () => {
    expect(responsive).toContain("--v3-system-safe-top: var(--solaris-system-safe-top");
    expect(responsive).toContain("--v3-top-context-obstruction");
    expect(responsive).toContain("--v3-shell-top-obstruction");
    expect(responsive).toContain("min-height: var(--v3-top-context-obstruction)");
    expect(responsive).toContain("var(--solaris-safe-content-gap, 0.25rem)");
  });

  it("keeps focused Confirmation/Jury/Televote chrome on the same safe boundary", () => {
    expect(focusedTask).toContain("--v3-focused-task-safe-top: var(");
    expect(focusedTask).toContain("--solaris-safe-content-top");
    expect(focusedTask).toContain("var(--solaris-safe-right");
    expect(focusedTask).toContain("var(--solaris-safe-bottom");
    expect(focusedTask).toContain("var(--solaris-safe-left");
    expect(focusedTask).toContain(
      "scroll-margin-block-start: calc(4.75rem + var(--v3-focused-task-safe-top))",
    );
    expect(focusedTask).not.toContain("calc(env(safe-area-inset-top) + 0.45rem)");
  });

  it("keeps anchors and keyboard-focus targets below sticky shell chrome", () => {
    expect(responsive).toContain("scroll-margin-block-start: var(--v3-shell-top-obstruction)");
    expect(responsive).toContain("a[href]");
    expect(responsive).toContain("button");
    expect(responsive).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("composes desktop navigation from the same top obstruction instead of a second magic offset", () => {
    const desktopStart = responsive.indexOf("@media (min-width: 1024px)");
    const wideStart = responsive.indexOf("@media (min-width: 1440px)");
    const desktop = responsive.slice(desktopStart, wideStart);

    expect(desktopStart).toBeGreaterThanOrEqual(0);
    expect(wideStart).toBeGreaterThan(desktopStart);
    expect(desktop).toContain("top: var(--v3-top-context-obstruction)");
    expect(desktop).not.toContain("top: calc(3.25rem + env(safe-area-inset-top))");
  });

  it("retains 44px controls and reduced-transparency protection", () => {
    expect(foundations).toContain(".v3-icon-button");
    expect(foundations).toContain("width: 2.75rem");
    expect(foundations).toContain("height: 2.75rem");
    const reduced = foundations.slice(
      foundations.indexOf("@media (prefers-reduced-transparency: reduce)"),
    );
    expect(reduced).toContain(".v3-top-context");
    expect(reduced).toContain("backdrop-filter: none");
  });
});