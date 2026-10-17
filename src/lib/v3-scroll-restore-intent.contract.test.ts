import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 remembered-scroll intent rebasing", () => {
  it("restores after paint, emits an explicit rebase signal and exposes cancellation", () => {
    const restore = source("src/lib/v3-scroll-restoration.ts");

    expect(restore).toContain(
      'export const V3_SCROLL_RESTORED_EVENT = "solaris:v3-scroll-restored"',
    );
    expect(restore.match(/requestAnimationFrame/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(restore).toContain('window.scrollTo({ top: targetY, behavior: "auto" })');
    expect(restore).toContain("window.dispatchEvent(new Event(V3_SCROLL_RESTORED_EVENT))");
    expect(restore).toContain("window.cancelAnimationFrame(firstFrame)");
    expect(restore).toContain("window.cancelAnimationFrame(secondFrame)");
  });

  it("rebases compact-state intent instead of treating restoration as downward user travel", () => {
    const hook = source("src/lib/use-scroll-responsive-bar.ts");
    const rebaseStart = hook.indexOf("const rebaseAfterRestoration =");
    const listenerStart = hook.indexOf(
      'window.addEventListener("scroll", onScroll',
      rebaseStart,
    );
    const rebaseBlock = hook.slice(rebaseStart, listenerStart);

    expect(hook).toContain("V3_SCROLL_RESTORED_EVENT");
    expect(rebaseBlock).toContain("window.cancelAnimationFrame(frame.current)");
    expect(rebaseBlock).toContain("lastY.current = Math.max(0, window.scrollY)");
    expect(rebaseBlock).toContain("downTravel.current = 0");
    expect(rebaseBlock).toContain("upTravel.current = 0");
    expect(rebaseBlock).toContain("setCollapsedState(false)");
    expect(hook).toContain(
      "window.addEventListener(V3_SCROLL_RESTORED_EVENT, rebaseAfterRestoration)",
    );
  });

  it("routes both Public and Organizer memory restoration through the cancellable helper", () => {
    const publicShell = source("src/components/v3/V3AppShell.tsx");
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    for (const code of [publicShell, organizer]) {
      expect(code).toContain("scheduleV3ScrollRestoration");
      expect(code).toContain("const cancelScrollRestore =");
      expect(code).toContain("cancelScrollRestore?.()");
      expect(code).not.toContain(
        'window.requestAnimationFrame(() => {\n        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }))',
      );
    }
  });
});
