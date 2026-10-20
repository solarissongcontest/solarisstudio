import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = source("scripts/generate-v3-completion-dashboard.ts");
const swipeSurface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
const appShell = source("src/components/v3/V3AppShell.tsx");

describe("V3 QA navigation dashboard evidence ownership", () => {
  it("recognizes the canonical top-level swipe compositor as the N6 page viewport from source evidence", () => {
    expect(swipeSurface).toContain('type SwipeSlot = "previous" | "current" | "next"');
    expect(swipeSurface).toContain("previousSurface");
    expect(swipeSurface).toContain("nextSurface");
    expect(swipeSurface).toContain('root.style.setProperty("--v3-navigation-progress"');

    expect(dashboard).toContain('const topLevelSwipeSurface = "src/components/v3/V3TopLevelSwipeSurface.tsx";');
    expect(dashboard).toContain("const hasCanonicalTopLevelSwipeViewport =");
    expect(dashboard).toContain("sourceContains(topLevelSwipeSurface, /type SwipeSlot");
    expect(dashboard).toContain("sourceContains(topLevelSwipeSurface, /previousSurface/)");
    expect(dashboard).toContain("sourceContains(topLevelSwipeSurface, /nextSurface/)");
    expect(dashboard).toContain("sourceContains(topLevelSwipeSurface, /--v3-navigation-progress/)");
    expect(dashboard).toContain("hasCanonicalTopLevelSwipeViewport ||");
    expect(dashboard).toContain('id: "N6", name: "top-level page viewport", state: hasPageViewport ? "implemented" : "missing"');
  });

  it("rejects existence-only N6 evidence while retaining legacy source-based fallbacks", () => {
    expect(dashboard).not.toContain("existsSync(topLevelSwipeSurface)");
    expect(dashboard).not.toContain('existsSync("src/components/v3/V3PageViewport.tsx")');
    expect(dashboard).toContain('sourceContains("src/components/v3/V3PageViewport.tsx", /previous.*current.*next|visualProgress/s)');
    expect(dashboard).toContain('sourceContains("src/components/v3/V3AppShell.tsx", /previous.*current.*next|visualProgress/s)');
  });

  it("does not require NAV to duplicate the compositor into V3AppShell to satisfy N6 evidence", () => {
    expect(appShell).not.toContain("V3TopLevelSwipeSurface");
    expect(appShell).not.toContain("swipePreviewSurfaces");
  });

  it("keeps implementation evidence separate from route activation and final human/reference certification", () => {
    expect(swipeSurface).toContain("previewReady = false");
    expect(swipeSurface).toContain('const enabled = policy === "enabled" && previewReady && requiredAdjacentSurfacesReady;');
    expect(dashboard).toContain('id: "N14", name: "final parity certification", state: "missing"');
    expect(dashboard).toContain("Reference baseline is not frozen");
  });
});
