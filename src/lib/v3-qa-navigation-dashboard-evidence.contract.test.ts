import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = source("scripts/generate-v3-completion-dashboard.ts");
const swipeSurface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
const appShell = source("src/components/v3/V3AppShell.tsx");

describe("V3 QA navigation dashboard evidence ownership", () => {
  it("recognizes the compositor as foundation evidence without pretending it is production integration", () => {
    expect(swipeSurface).toContain('type SwipeSlot = "previous" | "current" | "next"');
    expect(swipeSurface).toContain("previousSurface");
    expect(swipeSurface).toContain("nextSurface");
    expect(swipeSurface).toContain('root.style.setProperty("--v3-navigation-progress"');

    expect(dashboard).toContain('const topLevelSwipeSurface = "src/components/v3/V3TopLevelSwipeSurface.tsx";');
    expect(dashboard).toContain("const hasCanonicalTopLevelSwipeViewport =");
    expect(dashboard).toContain("const hasProductionTopLevelSwipeIntegration =");
    expect(dashboard).toContain("sourceContains(appShell, /V3TopLevelSwipeSurface/)");
    expect(dashboard).toContain("sourceContains(appShell, /<V3TopLevelSwipeSurface\\b/)");
    expect(dashboard).toContain(
      "const hasPageViewport = hasProductionTopLevelSwipeIntegration || hasLegacyPageViewportIntegration;",
    );
    expect(dashboard).not.toContain("hasCanonicalTopLevelSwipeViewport ||\n  sourceContains");
  });

  it("reports current fail-closed reality as foundation rather than implemented page swipe", () => {
    // Current main deliberately keeps this compositor out of V3AppShell until route
    // owners can provide safe live adjacent surfaces. QA must mirror that reality.
    expect(appShell).not.toContain("V3TopLevelSwipeSurface");
    expect(appShell).not.toContain("swipePreviewSurfaces");

    expect(dashboard).toContain(
      'state: hasPageViewport ? "integrated" : hasPageViewportFoundation ? "foundation" : "missing"',
    );
    expect(dashboard).toContain(
      "Swipe compositor foundation exists, but production V3AppShell activation was not detected",
    );
    expect(dashboard).toContain(
      "Whole-page swipe remains fail-closed until the production shell mounts safe live adjacent surfaces",
    );
  });

  it("keeps whole-page direct manipulation dependent on real shell activation", () => {
    expect(dashboard).toContain(
      'state: hasPageViewport && hasVisualProgress\n      ? "integrated"\n      : hasPageViewportFoundation && hasVisualProgress\n        ? "foundation"',
    );
    expect(dashboard).toContain(
      "Compositor/progress primitives do not count as whole-page product integration until V3AppShell mounts them",
    );
    expect(dashboard).toContain("productionShellIntegration: hasProductionTopLevelSwipeIntegration");
  });

  it("keeps implementation evidence separate from route activation and final human/reference certification", () => {
    expect(swipeSurface).toContain("previewReady = false");
    expect(swipeSurface).toContain('const enabled = policy === "enabled" && previewReady && requiredAdjacentSurfacesReady;');
    expect(dashboard).toContain('id: "N14", name: "final parity certification", state: "missing"');
    expect(dashboard).toContain("Reference baseline is not frozen");
  });
});
