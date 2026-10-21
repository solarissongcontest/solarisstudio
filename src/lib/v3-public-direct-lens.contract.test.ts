import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Public direct-lens N4/N5 wiring", () => {
  it("drives lens and icon optics from the shared logical visual-progress model", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const helper = source("src/lib/v3-navigation-visual-progress.ts");

    expect(helper).toContain("export function resolveV3NavigationVisualProgress");
    expect(helper).toContain("export function resolveV3TabIconVisualState");
    expect(tabs).toContain("resolveV3NavigationVisualProgress({");
    expect(tabs).toContain("physicalDelta: response.delta");
    expect(tabs).toContain("direction: drag.layoutDirection");
    expect(tabs).toContain("resolveV3TabIconVisualState(iconIndex, visualProgress)");
    expect(tabs).toContain("icon.style.opacity = visualState.opacity.toFixed(4)");
    expect(tabs).toContain(
      "icon.style.transform = `scale(${visualState.scale.toFixed(4)})`",
    );
    expect(tabs).toContain(
      'icon.style.setProperty("stroke-width", visualState.strokeWidth.toFixed(4))',
    );
  });

  it("pre-measures layout before drag and keeps pointer-move compositor-only", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const moveStart = tabs.indexOf("const moveDrag =");
    const moveEnd = tabs.indexOf("const selectDestination =", moveStart);
    const hotLoop = tabs.slice(moveStart, moveEnd);

    expect(tabs).toContain("const rects = tabRects();");
    expect(tabs).toContain("slotWidth: origin.width");
    expect(hotLoop).not.toContain("getBoundingClientRect");
    expect(hotLoop).not.toContain("querySelectorAll");
    expect(hotLoop).toContain("if (nextPreview !== drag.previewIndex)");
    expect(hotLoop).toContain("drag.previewIndex = nextPreview");
  });

  it("clears temporary optical state and keeps release adjacent-only and semantic", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabs).toContain('icon.style.removeProperty("opacity")');
    expect(tabs).toContain('icon.style.removeProperty("transform")');
    expect(tabs).toContain('icon.style.removeProperty("stroke-width")');
    expect(tabs).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
    expect(tabs).toContain("onSelect(destination)");
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
  });
});
