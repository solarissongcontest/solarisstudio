import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Liquid navigation update interruption safety", () => {
  it("blocks replacement reloads for the direct lens lifecycle", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = tabs.indexOf("const startDrag =");
    const move = tabs.indexOf("const moveDrag =", start);
    const reset = tabs.indexOf("const resetDragDom =");
    const clear = tabs.indexOf("const clearDrag =", reset);
    const startBlock = tabs.slice(start, move);
    const resetBlock = tabs.slice(reset, clear);

    expect(tabs).toContain(
      'const V3_LIQUID_LENS_UPDATE_BLOCKER = "v3-liquid-lens-drag"',
    );
    expect(startBlock).toContain("setAppUpdateBlocker(");
    expect(startBlock).toContain("V3_LIQUID_LENS_UPDATE_BLOCKER");
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_LIQUID_LENS_UPDATE_BLOCKER)",
    );
  });

  it("keeps interruption exits on click-safe unified cleanup and adjacent-only release", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    expect(tabs).toContain("const clearDrag = useCallback");
    expect(tabs).toContain("resetDragDom();");
    expect(tabs).toContain("const interruptDrag = useCallback");
    expect(tabs).toContain("if (dragState.current) suppressClick.current = true");
    expect(tabs).toContain("const resetInterruptedGesture = () => interruptDrag()");
    expect(tabs).toContain("root.hasAttribute(\"data-solaris-feature-overlay-open\")");
    expect(tabs).toContain("root.hasAttribute(\"data-solaris-keyboard-open\")");
    expect(tabs).toContain("onPointerCancel={cancelDrag}");
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
    expect(tabs.match(/maxSteps: 1/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("keeps the route transition itself update-safe after pointer release", () => {
    const transitions = source("src/lib/app-view-transitions.ts");
    expect(transitions).toContain("nextViewTransitionBlockerId()");
    expect(transitions).toContain("setAppUpdateBlocker(");
    expect(transitions).toContain("await transition.finished");
    expect(transitions).toContain("clearAppUpdateBlocker(updateBlockerId)");
  });
});
