import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Liquid navigation update interruption safety", () => {
  it("blocks replacement reloads only once the direct lens gesture is engaged", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const blockerCall = tabs.indexOf("setAppUpdateBlocker(");
    const holdEffectStart = tabs.lastIndexOf("useEffect", blockerCall);
    const nextEffect = tabs.indexOf("useEffect", blockerCall + 1);
    const holdBlock = tabs.slice(holdEffectStart, nextEffect);
    const reset = tabs.indexOf("const resetDragDom =");
    const clear = tabs.indexOf("const clearDrag =", reset);
    const resetBlock = tabs.slice(reset, clear);

    expect(tabs).toContain(
      'const V3_LIQUID_LENS_UPDATE_BLOCKER = "v3-liquid-lens-drag"',
    );
    expect(holdBlock).toContain("if (!held) return;");
    expect(holdBlock).toContain("if (!drag || drag.engaged) return;");
    expect(holdBlock).toContain("drag.engaged = true;");
    expect(holdBlock).toContain("setAppUpdateBlocker(");
    expect(holdBlock).toContain("V3_LIQUID_LENS_UPDATE_BLOCKER");
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
