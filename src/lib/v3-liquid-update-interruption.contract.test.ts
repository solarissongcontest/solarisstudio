import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Liquid navigation update interruption safety", () => {
  it("blocks replacement-worker reloads for the direct lens press and drag lifecycle", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = tabs.indexOf("const startDrag =");
    const move = tabs.indexOf("const moveDrag =", start);
    const reset = tabs.indexOf("const resetDragDom =");
    const clear = tabs.indexOf("const clearDrag =", reset);
    const startBlock = tabs.slice(start, move);
    const resetBlock = tabs.slice(reset, clear);

    expect(tabs).toContain('const V3_LIQUID_LENS_UPDATE_BLOCKER = "v3-liquid-lens-drag"');
    expect(startBlock).toContain("setAppUpdateBlocker(");
    expect(startBlock).toContain("V3_LIQUID_LENS_UPDATE_BLOCKER");
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_LIQUID_LENS_UPDATE_BLOCKER)",
    );
  });

  it("keeps every exit path on unified cleanup and preserves adjacent-only release semantics", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabs).toContain("const clearDrag = useCallback");
    expect(tabs).toContain("resetDragDom();");
    expect(tabs).toContain("const settleDrag = useCallback");
    expect(tabs).toContain("const resetInterruptedGesture = () => clearDrag()");
    expect(tabs).toContain("onPointerCancel={cancelDrag}");
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
    expect(tabs.match(/maxSteps: 1/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("keeps the route/view-transition handoff update-safe until visual completion", () => {
    const transitions = source("src/lib/app-view-transitions.ts");

    expect(transitions).toContain(
      'const APP_VIEW_TRANSITION_UPDATE_BLOCKER = "app-view-transition"',
    );
    expect(transitions).toContain("let appViewTransitionSequence = 0");
    expect(transitions).toContain("function nextViewTransitionBlockerId()");
    expect(transitions).toContain(
      "const updateBlockerId = nextViewTransitionBlockerId()",
    );
    expect(transitions).toContain("setAppUpdateBlocker(");
    expect(transitions).toContain("await transition.finished");
    expect(transitions).toContain("clearAppUpdateBlocker(updateBlockerId)");
    expect(transitions).not.toContain(
      "clearAppUpdateBlocker(APP_VIEW_TRANSITION_UPDATE_BLOCKER)",
    );
    expect(transitions).toMatch(
      /setAppUpdateBlocker\([\s\S]*try \{[\s\S]*prefersReducedMotion\(\)[\s\S]*finally \{[\s\S]*clearAppUpdateBlocker\(updateBlockerId\)/,
    );
  });

  it("keeps push/pop/tab marker ownership correct when transitions overlap", () => {
    const transitions = source("src/lib/app-view-transitions.ts");

    expect(transitions).toContain(
      "const activeViewTransitionMarkers = new Map<string, AppViewTransitionKind>()",
    );
    expect(transitions).toContain("activateViewTransitionMarker(root, updateBlockerId, kind)");
    expect(transitions).toContain("activeViewTransitionMarkers.set(ownerId, kind)");
    expect(transitions).toContain("activeViewTransitionMarkers.delete(ownerId)");
    expect(transitions).toContain("const latestKind = remainingKinds.at(-1)");
    expect(transitions).toContain("releaseViewTransitionMarker(root, updateBlockerId)");
    expect(transitions).not.toContain("delete root.dataset.solarisViewTransition;\n    }\n  } finally");
  });
});
