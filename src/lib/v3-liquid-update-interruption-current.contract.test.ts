import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Liquid navigation update interruption safety", () => {
  it("blocks replacement reloads only after the direct lens is engaged", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const engage = tabs.indexOf("if (!held) return;");
    const engageEnd = tabs.indexOf("useEffect(() => {", engage + 1);
    const start = tabs.indexOf("const startDrag =");
    const move = tabs.indexOf("const moveDrag =", start);
    const reset = tabs.indexOf("const resetDragDom =");
    const clear = tabs.indexOf("const clearDrag =", reset);
    const engageBlock = tabs.slice(engage, engageEnd);
    const startBlock = tabs.slice(start, move);
    const resetBlock = tabs.slice(reset, clear);

    expect(tabs).toContain(
      'const V3_LIQUID_LENS_UPDATE_BLOCKER = "v3-liquid-lens-drag"',
    );
    expect(engageBlock).toContain("drag.engaged = true");
    expect(engageBlock).toContain("setAppUpdateBlocker(");
    expect(engageBlock).toContain("V3_LIQUID_LENS_UPDATE_BLOCKER");
    expect(startBlock).not.toContain("setAppUpdateBlocker(");
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_LIQUID_LENS_UPDATE_BLOCKER)",
    );
  });

  it("keeps interruption exits on unified cleanup and adjacent-only release", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    expect(tabs).toContain("const clearDrag = useCallback");
    expect(tabs).toContain("resetDragDom();");
    expect(tabs).toContain("const resetInterruptedGesture = () => clearDrag()");
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
