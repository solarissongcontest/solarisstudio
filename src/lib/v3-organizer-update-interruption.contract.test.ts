import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Organizer navigation update interruption safety", () => {
  it("blocks replacement-worker reloads for a valid Organizer lens gesture", () => {
    const tabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const start = tabs.indexOf("const startDrag =");
    const move = tabs.indexOf("const moveDrag =", start);
    const startBlock = tabs.slice(start, move);

    expect(tabs).toContain(
      'const V3_ORGANIZER_LENS_UPDATE_BLOCKER = "v3-organizer-lens-drag"',
    );
    expect(startBlock).toContain("setAppUpdateBlocker(");
    expect(startBlock).toContain("V3_ORGANIZER_LENS_UPDATE_BLOCKER");
    expect(startBlock.indexOf("if (")).toBeLessThan(startBlock.indexOf("setAppUpdateBlocker("));
  });

  it("clears gesture update safety through interruption-aware unified cleanup", () => {
    const tabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const reset = tabs.indexOf("const resetDragDom =");
    const clear = tabs.indexOf("const clearDrag =", reset);
    const resetBlock = tabs.slice(reset, clear);

    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_ORGANIZER_LENS_UPDATE_BLOCKER)",
    );
    expect(tabs).toContain("const interruptDrag = useCallback");
    expect(tabs).toContain("if (dragState.current) suppressClick.current = true");
    expect(tabs).toContain("const resetInterruptedGesture = () => interruptDrag()");
    expect(tabs).toContain('window.addEventListener("blur", resetInterruptedGesture)');
    expect(tabs).toContain('window.addEventListener("pagehide", resetInterruptedGesture)');
    expect(tabs).toContain('window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture)');
    expect(tabs).toContain("root.hasAttribute(\"data-solaris-feature-overlay-open\")");
    expect(tabs).toContain("root.hasAttribute(\"data-solaris-keyboard-open\")");
    expect(tabs).toContain("onPointerCancel={cancelDrag}");
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
  });

  it("hands committed navigation into the already update-safe route transition", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const transitions = source("src/lib/app-view-transitions.ts");

    expect(chrome).toContain("runAppViewTransition(alreadyActive ? \"pop\" : \"tab\"");
    expect(transitions).toContain("nextViewTransitionBlockerId()");
    expect(transitions).toContain("await transition.finished");
    expect(transitions).toContain("clearAppUpdateBlocker(updateBlockerId)");
  });
});
