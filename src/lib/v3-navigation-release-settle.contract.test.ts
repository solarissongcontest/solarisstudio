import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 page-swipe release settle ownership", () => {
  it("keeps release velocity alive through compositor settle", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain("resolveV3PageSettleMotion({");
    expect(surface).toContain("velocityX: drag.velocityX");
    expect(surface).toContain("applySettleMotion(settleMotion.durationMs)");
    expect(surface).toContain("const settleCleanupMs = settleMotion.durationMs + 32");
    expect(surface).not.toContain("window.setTimeout(resetSurface, 190)");
    expect(surface).not.toMatch(/\},\s*180\);/);
  });

  it("publishes one settle duration to both page and Liquid material", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const styles = source("src/styles/v3-top-level-swipe.css");

    expect(surface).toContain(
      'surfaceRef.current?.style.setProperty("--v3-page-settle-ms", duration)',
    );
    expect(surface).toContain(
      'navigationMaterial()?.style.setProperty("--v3-page-settle-ms", duration)',
    );
    expect(surface).toContain(
      'surface.style.removeProperty("--v3-page-settle-ms")',
    );
    expect(surface).toContain(
      'material?.style.removeProperty("--v3-page-settle-ms")',
    );

    expect(styles).toContain(
      "transition: transform var(--v3-page-settle-ms, 180ms) var(--v3-ease-spring)",
    );
    expect(styles).toContain(
      '.v3-liquid-tabbar__material[data-v3-page-settling="true"]',
    );
    expect(styles.match(/--v3-page-settle-ms/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
  });

  it("keeps reduced-motion and live-surface safety intact", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const styles = source("src/styles/v3-top-level-swipe.css");

    expect(surface).toContain("prefersReducedMotion()");
    expect(surface).toContain("previousSurface");
    expect(surface).toContain("nextSurface");
    expect(surface).not.toContain("html2canvas");
    expect(surface).not.toContain("toDataURL");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("transition: none !important");
  });
});
