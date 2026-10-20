import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tabs = readFileSync("src/components/app/AppTabBar.tsx", "utf8");

describe("retained AppTabBar interruption safety", () => {
  it("arms update safety for an owned lens drag and clears it during reset", () => {
    const resetStart = tabs.indexOf("const resetDragDom = useCallback");
    const clearStart = tabs.indexOf("const clearDrag = useCallback", resetStart);
    const startDragStart = tabs.indexOf("const startDrag =", clearStart);
    const moveDragStart = tabs.indexOf("const moveDrag =", startDragStart);
    const resetBlock = tabs.slice(resetStart, clearStart);
    const startDragBlock = tabs.slice(startDragStart, moveDragStart);

    expect(tabs).toContain(
      'const APP_TABBAR_LENS_UPDATE_BLOCKER = "app-tabbar-lens-drag"',
    );
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(APP_TABBAR_LENS_UPDATE_BLOCKER)",
    );
    expect(startDragBlock).toContain("setAppUpdateBlocker(");
    expect(startDragBlock).toContain("APP_TABBAR_LENS_UPDATE_BLOCKER");
    expect(startDragBlock).toContain(
      '"Finish the current navigation gesture before updating."',
    );
  });

  it("suppresses the trailing click before environment-level cleanup", () => {
    const interruptStart = tabs.indexOf("const interruptDrag = useCallback");
    const listenerStart = tabs.indexOf("useEffect(() => {", interruptStart);
    const interruptBlock = tabs.slice(interruptStart, listenerStart);

    expect(interruptBlock).toContain("if (!dragState.current) return");
    expect(interruptBlock).toContain("suppressClick.current = true");
    expect(interruptBlock).toContain("clearDrag();");
    expect(interruptBlock.indexOf("suppressClick.current = true")).toBeLessThan(
      interruptBlock.indexOf("clearDrag();"),
    );
  });

  it("clears stale interruption suppression before an inactive fresh pointer returns early", () => {
    const startDragStart = tabs.indexOf("const startDrag =");
    const moveDragStart = tabs.indexOf("const moveDrag =", startDragStart);
    const startDragBlock = tabs.slice(startDragStart, moveDragStart);
    const resetIndex = startDragBlock.indexOf(
      "if (!dragState.current) suppressClick.current = false",
    );
    const inactiveGuardIndex = startDragBlock.indexOf("!active ||");

    expect(resetIndex).toBeGreaterThan(-1);
    expect(inactiveGuardIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeLessThan(inactiveGuardIndex);
  });

  it("treats app/browser/overlay/keyboard changes as gesture interruption boundaries", () => {
    expect(tabs).toContain('window.addEventListener("blur", resetInterruptedGesture)');
    expect(tabs).toContain('window.addEventListener("resize", resetInterruptedGesture)');
    expect(tabs).toContain(
      'window.addEventListener("orientationchange", resetInterruptedGesture)',
    );
    expect(tabs).toContain(
      'window.addEventListener("pagehide", resetInterruptedGesture)',
    );
    expect(tabs).toContain(
      "window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture)",
    );
    expect(tabs).toContain('document.addEventListener("visibilitychange", resetWhenHidden)');
    expect(tabs).toContain('"data-solaris-feature-overlay-open"');
    expect(tabs).toContain('"data-solaris-keyboard-open"');
  });

  it("interrupts an active retained-shell gesture when route context changes", () => {
    const marker =
      "// A route/search replacement can keep this shell mounted, so treat it as a";
    const routeEffectStart = tabs.indexOf(marker);
    const startDragStart = tabs.indexOf("const startDrag =", routeEffectStart);
    const routeEffect = tabs.slice(routeEffectStart, startDragStart);

    expect(routeEffectStart).toBeGreaterThan(-1);
    expect(routeEffect).toContain("interruptDrag();");
    expect(routeEffect).toContain("[interruptDrag, pathname, searchStr]");
  });
});