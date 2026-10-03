import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 interaction primitive contracts", () => {
  it("keeps gesture enhancements optional rather than required", () => {
    const sheet = source("src/components/interaction/SolarisDraggableSheet.tsx");
    const reorder = source("src/components/interaction/SolarisReorderableList.tsx");
    const swipe = source("src/components/interaction/SolarisSwipeActionRow.tsx");

    expect(sheet).toContain('aria-label="Expand sheet"');
    expect(sheet).toContain('aria-label="Collapse sheet"');
    expect(sheet).toContain('aria-label="Close sheet"');
    expect(reorder).toContain("Move ${item.ariaLabel} up");
    expect(reorder).toContain("Move ${item.ariaLabel} down");
    expect(swipe).toContain("Actions");
  });

  it("gives advanced primitives cancellation paths", () => {
    const sheet = source("src/components/interaction/SolarisDraggableSheet.tsx");
    const reorder = source("src/components/interaction/SolarisReorderableList.tsx");
    const swipe = source("src/components/interaction/SolarisSwipeActionRow.tsx");

    expect(sheet).toContain("onPointerCancel");
    expect(sheet).toContain("onLostPointerCapture");
    expect(reorder).toContain("onPointerCancel");
    expect(reorder).toContain("onLostPointerCapture");
    expect(swipe).toContain("onPointerCancel");
    expect(swipe).toContain("onLostPointerCapture");
  });

  it("includes the complete Phase 4 primitive family", () => {
    for (const path of [
      "src/components/interaction/SolarisPressable.tsx",
      "src/components/interaction/SolarisElasticGlass.tsx",
      "src/components/interaction/SolarisDraggableSheet.tsx",
      "src/components/interaction/SolarisMorphingSelection.tsx",
      "src/components/interaction/SolarisSwipeActionRow.tsx",
      "src/components/interaction/SolarisReorderableList.tsx",
      "src/lib/use-scroll-responsive-bar.ts",
      "src/lib/gesture-coordinator.ts",
      "src/lib/interaction-preferences.ts",
    ]) {
      expect(source(path).length, path).toBeGreaterThan(40);
    }
  });
});
