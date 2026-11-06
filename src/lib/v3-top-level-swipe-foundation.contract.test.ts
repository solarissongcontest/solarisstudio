import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 top-level swipe foundation", () => {
  it("stays fail-closed until route owners explicitly provide safe preview surfaces", () => {
    const appShell = source("src/components/v3/V3AppShell.tsx");
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(appShell).not.toContain("V3TopLevelSwipeSurface");
    expect(appShell).not.toContain("swipePreviewSurfaces");
    expect(surface).toContain("previewReady = false");
    expect(surface).toContain('policy === "enabled" && previewReady && requiredAdjacentSurfacesReady');
  });

  it("renders only live previous/current/next surfaces and isolates non-canonical previews", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain("previousSurface?: ReactNode");
    expect(surface).toContain("nextSurface?: ReactNode");
    expect(surface).toContain('data-v3-swipe-preview="previous"');
    expect(surface).toContain('data-v3-swipe-preview="next"');
    expect(surface).toContain('inert={canonicalSlot !== "previous"}');
    expect(surface).toContain('inert={canonicalSlot !== "current"}');
    expect(surface).toContain('inert={canonicalSlot !== "next"}');
    expect(surface).toContain('aria-hidden={canonicalSlot === "previous" ? undefined : true}');
    expect(surface).toContain('aria-hidden={canonicalSlot === "current" ? undefined : true}');
    expect(surface).toContain('aria-hidden={canonicalSlot === "next" ? undefined : true}');
    expect(surface).not.toContain("html2canvas");
    expect(surface).not.toContain("toDataURL");
    expect(surface).not.toContain("supabase");
    expect(surface).not.toContain("fetch(");
  });

  it("evacuates focus before a retained page remains inert and aria-hidden", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain("useLayoutEffect(() => {");
    expect(surface).toContain('focusedElement.closest<HTMLElement>(".v3-top-level-swipe-page")');
    expect(surface).toContain('focusedPage.dataset.v3SwipeCanonical === "true"');
    expect(surface).toContain('[data-v3-tab-index][aria-current="page"]');
    expect(surface).toContain("(selectedTab ?? surface).focus({ preventScroll: true })");
    expect(surface).toContain("tabIndex={-1}");
  });

  it("keeps page, lens and icon motion on one continuous visual progress", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain('root.style.setProperty("--v3-navigation-progress"');
    expect(surface).toContain('track.style.setProperty("--v3-page-swipe-x"');
    expect(surface).toContain('material.style.setProperty("--v3-liquid-drag-x"');
    expect(surface).toContain("resolveV3TabIconVisualState(index, boundedProgress)");
    expect(surface).toContain('publishVisualProgress(progress, drag, "drag")');
    expect(surface).toContain('publishVisualProgress(targetIndex, drag, "settle")');
  });

  it("fails closed around critical work, browser edges and content-owned horizontal gestures", () => {
    const gesture = source("src/lib/v3-navigation-gesture.ts");

    expect(gesture).toContain('if (screen.behavior.criticalTask) return "critical-flow"');
    expect(gesture).toContain('if (screen.behavior.immersive || screen.chrome.tabbar !== "full") return "disabled"');
    expect(gesture).toContain('[data-v3-swipe-owner="content"]');
    expect(gesture).toContain('[data-v3-horizontal-gesture="true"]');
    expect(gesture).toContain('[role="slider"]');
    expect(gesture).toContain("isV3BrowserEdgeGestureStart");
    expect(gesture).toContain("classifyV3SwipeIntent");
  });

  it("keeps route ownership outside the compositor and commits only after gesture target resolution", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain("onCommit: (targetIndex: number) => void");
    expect(surface).toContain("const targetIndex = resolveV3PageSwipeTarget({");
    expect(surface).toContain("onCommit(targetIndex)");
    expect(surface).toContain("onSettled?.(targetIndex)");
    expect(surface).not.toContain("useNavigate");
    expect(surface).not.toContain("<Link");
  });
});
