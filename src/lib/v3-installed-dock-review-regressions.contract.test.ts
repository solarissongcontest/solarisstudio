import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveV3LogicalHorizontalDelta } from "./v3-navigation-gesture";
import { resolveTabDragTargetIndex } from "./interaction-physics";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 installed dock review regressions", () => {
  const tab = source("src/components/app/AppTabBar.tsx");
  const shell = source("src/components/v3/V3AppShell.tsx");
  const css = source("src/styles/v3-responsive-shell.css");

  it("delegates installed tab and scroll-memory actions to the V3 viewer-scoped owner", () => {
    expect(shell).toContain("onSelectV3Tab={(id) => {");
    expect(shell).toContain("selectDestination(destination)");
    expect(shell).toContain("v3PublicEntryHref(getV3PublicTabDestination(id, undefined, navigationScope))");
    expect(shell).toContain("key={navigationInteractionKey}");
    expect(tab).toContain("onSelectV3Tab(area.id);");
  });

  it("resets stale suppressed clicks before the next pointer eligibility check", () => {
    expect(tab).toMatch(/const startDrag = \([\s\S]*?suppressClick\.current = false;\s*if \(/);
  });

  it("releases captured pointers and clears gestures on app interruption", () => {
    expect(tab).toContain("captureTarget: event.currentTarget");
    expect(tab).toContain("if (dragState.current) suppressClick.current = true;");
    expect(tab).toContain("drag.captureTarget.releasePointerCapture?.(drag.pointerId)");
    expect(tab).toContain('"data-solaris-feature-overlay-open"');
    expect(tab).toContain('"data-solaris-keyboard-open"');
    expect(tab).toContain('window.addEventListener("pagehide", resetInterruptedGesture)');
    expect(tab).toContain("window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture)");
    expect(tab).toContain('window.addEventListener("resize", resetInterruptedGesture)');
    expect(tab).toContain("interruptionObserver?.disconnect()");
    expect(tab).toContain("onKeyDown={() => {");
  });

  it("normalizes RTL and LTR drag targets and sorts the physical bounds", () => {
    expect(tab).toContain("Math.min(minCenter - originCenter, maxCenter - originCenter)");
    expect(tab).toContain("Math.max(minCenter - originCenter, maxCenter - originCenter)");
    expect(tab.match(/resolveV3LogicalHorizontalDelta\(event\.clientX - drag\.startX, drag\.layoutDirection\)/g)).toHaveLength(2);
    expect(resolveTabDragTargetIndex({ rawDelta: resolveV3LogicalHorizontalDelta(-60, "rtl"), originIndex: 0, slotWidth: 70, itemCount: 5 })).toBe(1);
    expect(resolveTabDragTargetIndex({ rawDelta: resolveV3LogicalHorizontalDelta(60, "ltr"), originIndex: 0, slotWidth: 70, itemCount: 5 })).toBe(1);
  });

  it("keeps the iPad rail from obstructing V3 and avoids duplicate installed desktop nav", () => {
    expect(shell).toContain('isAppMode && "v3-installed-app-layout"');
    expect(shell).toContain("{!isAppMode ? (");
    expect(css).toContain('html[data-solaris-app] [data-solaris-v3] .v3-installed-app-layout');
    expect(css).toContain("padding-left: calc(7.35rem + env(safe-area-inset-left))");
  });
});
