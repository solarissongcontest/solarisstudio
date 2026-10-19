import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 page-swipe PWA update safety", () => {
  it("registers update safety only after horizontal ownership is established", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const moveStart = swipe.indexOf("const onPointerMove =");
    const finishStart = swipe.indexOf("const finish =", moveStart);
    const moveBlock = swipe.slice(moveStart, finishStart);

    expect(moveBlock).toContain('drag.owner === "undecided"');
    expect(moveBlock).toContain('drag.owner !== "horizontal"');
    expect(moveBlock).toContain("setAppUpdateBlocker(");
    expect(moveBlock).toContain("V3_PAGE_SWIPE_UPDATE_BLOCKER");
    expect(moveBlock.indexOf('drag.owner !== "horizontal"')).toBeLessThan(
      moveBlock.indexOf("setAppUpdateBlocker("),
    );
  });

  it("keeps the blocker through settle and clears it through unified reset", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const resetStart = swipe.indexOf("const resetSurface =");
    const progressStart = swipe.indexOf("const publishVisualProgress", resetStart);
    const resetBlock = swipe.slice(resetStart, progressStart);

    expect(swipe).toContain(
      'const V3_PAGE_SWIPE_UPDATE_BLOCKER = "v3-top-level-page-swipe"',
    );
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_PAGE_SWIPE_UPDATE_BLOCKER)",
    );
    expect(swipe).toContain('window.addEventListener("blur", interrupt)');
    expect(swipe).toContain('window.addEventListener("pagehide", interrupt)');
    expect(swipe).toContain('window.addEventListener(APP_RESUME_EVENT, interrupt)');
    expect(swipe).toContain("rootInterruptionObserver.disconnect()");
  });

  it("relies on the current runtime to defer cross-tab replacement reloads", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(runtime).toContain("updateSafetyRef.current.safe");
    expect(runtime).toContain("setControllerReloadPending(true)");
    expect(runtime).toContain(
      "if (!controllerReloadPending || !updateSafety.safe) return;",
    );
  });
});
