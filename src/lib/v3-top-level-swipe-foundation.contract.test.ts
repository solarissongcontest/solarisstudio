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

  it("clears compositor-owned progress, transforms and pointer capture on interruption reset", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(surface).toContain('track.style.setProperty("--v3-page-swipe-x", "0px")');
    expect(surface).toContain('material?.style.setProperty("--v3-liquid-drag-x", "0px")');
    expect(surface).toContain('root.removeAttribute("data-v3-navigation-progress-owner")');
    expect(surface).toContain("surface.releasePointerCapture?.(drag.pointerId)");
    expect(surface).toContain("const interrupt = () => resetSurface();");
    expect(surface).toContain('window.addEventListener("pagehide", interrupt)');
    expect(surface).toContain("window.addEventListener(APP_RESUME_EVENT, interrupt)");
    expect(surface).toContain('document.addEventListener("visibilitychange", hidden)');
    expect(surface).toMatch(/data-solaris-feature-overlay-open[\s\S]*data-solaris-keyboard-open/);
  });

  it("keeps logical page progress while mirroring physical composition in RTL", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(surface).toContain("layoutDirection: layoutDirectionFor(event.currentTarget)");
    expect(surface).toContain("direction: drag.layoutDirection");
    expect(surface).toContain("resolveV3PhysicalInlineSign(state.layoutDirection)");
    expect(surface).toContain(
      "const offsetRatio = (activeIndex - boundedProgress) * physicalInlineSign",
    );
    expect(surface).toContain(
      "(boundedProgress - activeIndex) * state.lensStepWidth * physicalInlineSign",
    );
    expect(css).toContain(".v3-top-level-swipe-surface:dir(rtl)");
    expect(css).toMatch(/page--previous[\s\S]*translate3d\(100%, 0, 0\)/);
    expect(css).toMatch(/page--next[\s\S]*translate3d\(-100%, 0, 0\)/);
  });

  it("preserves native nested-horizontal ownership until the recognizer claims a horizontal drag", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(css).not.toContain("touch-action: pan-y pinch-zoom");
    expect(css).toMatch(/data-v3-top-level-swipe-enabled="true"[\s\S]*touch-action: auto/);
    expect(surface).toContain("elementBlocksV3TopLevelSwipe(event.target)");
    expect(surface).toContain('surface.addEventListener("touchmove", preventOwnedHorizontalTouchPan');
    expect(surface).toContain("passive: false");
    expect(surface).toContain("event.touches.length !== 1");
    expect(surface).toContain('if (owner === "horizontal") event.preventDefault()');
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
