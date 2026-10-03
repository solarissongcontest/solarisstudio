import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 unified overlay and chrome ownership", () => {
  it("mounts viewport and keyboard chrome metrics only through AppOverlayManager", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manager = source("src/components/app/AppOverlayManager.tsx");

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
    expect(manager).toContain("updateAvailable && updateSafe");
    expect(manager).toContain("else if");
  });

  it("centralises viewport, keyboard and safe-area variables under the manager-owned metrics lifecycle", () => {
    const metrics = source("src/components/app/AppChromeMetrics.tsx");
    for (const token of [
      "--solaris-visual-viewport-height",
      "--solaris-keyboard-inset",
      "--solaris-safe-top",
      "--solaris-safe-right",
      "--solaris-safe-bottom",
      "--solaris-safe-left",
    ]) {
      expect(metrics, token).toContain(token);
    }
    expect(metrics).toContain("data-solaris-keyboard-open");
  });

  it("keeps persistent app chrome responsive to manager-owned overlay state", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("data-solaris-feature-overlay-open");
    expect(styles).toContain(".solaris-app-tabbar");
    expect(styles).toContain("[data-solaris-sheet]");
    expect(styles).toContain("[data-solaris-dialog]");
  });
});
