import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 unified overlay and chrome ownership", () => {
  it("keeps viewport authority in AppRuntime while safe-area aliases mount through AppOverlayManager", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manager = source("src/components/app/AppOverlayManager.tsx");

    expect(runtime).toContain("createAppViewportController");
    expect(runtime).not.toContain("AppChromeMetrics");
    expect(manager).toContain('import { AppChromeMetrics }');
    expect(manager.match(/<AppChromeMetrics\s*\/>/g)).toHaveLength(1);
  });

  it("gives the overlay manager one explicit root ownership marker and sheet/dialog observation", () => {
    const manager = source("src/components/app/AppOverlayManager.tsx");
    expect(manager).toContain('root.dataset.solarisChromeOwner = "overlay-manager"');
    expect(manager).toContain("data-solaris-feature-overlay-open");
    expect(manager).toContain("data-solaris-dialog");
    expect(manager).toContain("data-solaris-sheet");
    expect(manager).toContain("MutationObserver");
    expect(manager).toContain("delete root.dataset.solarisChromeOwner");
  });

  it("keeps transient app notices mutually exclusive instead of stacking them", () => {
    const manager = source("src/components/app/AppOverlayManager.tsx");
    expect(manager).toContain('connectivity.status !== "online"');
    expect(manager).toContain("!firstRunComplete");
    expect(manager).toContain("updatePromptAvailable && updateSafe");
    expect(manager).not.toContain("updateAvailable && updateSafe");
    expect(manager).toContain("else if");
  });

  it("separates canonical viewport and keyboard state from safe-area alias ownership", () => {
    const viewport = source("src/lib/app-viewport.ts");
    const metrics = source("src/components/app/AppChromeMetrics.tsx");

    for (const token of [
      "--solaris-visual-viewport-width",
      "--solaris-visual-viewport-height",
      "--solaris-visual-viewport-offset-left",
      "--solaris-visual-viewport-offset-top",
      "--solaris-visual-viewport-scale",
      "--solaris-keyboard-inset",
      "data-solaris-keyboard-open",
    ]) {
      expect(viewport, token).toContain(token);
    }

    for (const token of [
      "--solaris-safe-top",
      "--solaris-safe-right",
      "--solaris-safe-bottom",
      "--solaris-safe-left",
    ]) {
      expect(metrics, token).toContain(token);
    }

    expect(metrics).not.toContain("window.visualViewport");
    expect(metrics).not.toContain("--solaris-keyboard-inset");
    expect(metrics).not.toContain("--solaris-visual-viewport-height");
    expect(metrics).not.toContain("data-solaris-keyboard-open");
  });

  it("keeps persistent app chrome responsive to manager-owned overlay state", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("data-solaris-feature-overlay-open");
    expect(styles).toContain(".solaris-app-tabbar");
    expect(styles).toContain("[data-solaris-sheet]");
    expect(styles).toContain("[data-solaris-dialog]");
  });
});
