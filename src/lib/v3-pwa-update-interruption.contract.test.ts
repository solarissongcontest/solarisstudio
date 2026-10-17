import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 PWA update interruption safety", () => {
  it("does not let a replacement worker from another tab force-reload unsafe work", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const controllerStart = runtime.indexOf("const onControllerChange =");
    const resumeStart = runtime.indexOf("const onResume =", controllerStart);
    const controllerBlock = runtime.slice(controllerStart, resumeStart);

    expect(controllerBlock).toContain("updateSafetyRef.current.safe");
    expect(controllerBlock).toContain("setControllerReloadPending(true)");
    expect(controllerBlock.indexOf("updateSafetyRef.current.safe")).toBeLessThan(
      controllerBlock.indexOf("window.location.reload()"),
    );
    expect(runtime).toContain(
      "if (!controllerReloadPending || !updateSafety.safe) return;",
    );
    expect(runtime).toContain(
      "const updateAvailable = Boolean(waitingWorker) || controllerReloadPending",
    );
  });

  it("keeps an owned whole-page gesture inside the app-update safety boundary through settle", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const moveStart = swipe.indexOf("const onPointerMove =");
    const finishStart = swipe.indexOf("const finish =", moveStart);
    const moveBlock = swipe.slice(moveStart, finishStart);
    const resetStart = swipe.indexOf("const resetSurface =");
    const progressStart = swipe.indexOf("const publishVisualProgress", resetStart);
    const resetBlock = swipe.slice(resetStart, progressStart);

    expect(moveBlock).toContain("setAppUpdateBlocker(");
    expect(moveBlock).toContain("V3_PAGE_SWIPE_UPDATE_BLOCKER");
    expect(resetBlock).toContain(
      "clearAppUpdateBlocker(V3_PAGE_SWIPE_UPDATE_BLOCKER)",
    );
    expect(finishStart).toBeGreaterThan(moveStart);
  });

  it("derives route update blocking from canonical critical-task ownership", () => {
    const safety = source("src/lib/app-update-safety.ts");

    expect(safety).toContain('resolveSolarisAppScreen } from "@/lib/app-screen-registry"');
    expect(safety).toContain("resolveSolarisAppScreen(pathname).behavior.criticalTask");
    expect(safety).not.toContain("confirmations|jury-voting|televoting|next-in-line");
  });
});
