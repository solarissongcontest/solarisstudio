import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 direct lens visual progress contract", () => {
  it("keeps Public and Organizer on one shared visual-progress model", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const visualProgress = source("src/lib/v3-navigation-visual-progress.ts");

    expect(visualProgress).toContain("export function resolveV3NavigationVisualProgress");
    expect(visualProgress).toContain("resolveV3LogicalHorizontalDelta(physicalDelta, direction)");
    expect(visualProgress).toContain("export function resolveV3TabIconVisualState");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("tabIcons: SVGElement[]");
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
    }
  });

  it("keeps pointer-move free of layout reads and clears temporary optical state", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      const moveDrag = tabs.slice(
        tabs.indexOf("const moveDrag ="),
        tabs.indexOf("const finishDrag =") > -1
          ? tabs.indexOf("const finishDrag =")
          : tabs.indexOf("const selectDestination ="),
      );

      expect(moveDrag).not.toContain("getBoundingClientRect");
      expect(moveDrag).not.toContain("querySelectorAll");
      expect(tabs).toContain('icon.style.removeProperty("opacity")');
      expect(tabs).toContain('icon.style.removeProperty("transform")');
      expect(tabs).toContain('icon.style.removeProperty("stroke-width")');
    }

    expect(publicTabs).toContain("if (nextPreview !== drag.previewIndex)");
    expect(organizerTabs).toContain("if (previewIndex !== drag.previewIndex)");
  });

  it("does not change adjacent-only release or semantic navigation ownership", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
    }
    expect(publicTabs).toContain("onSelect(destination)");
    expect(publicTabs).toContain('aria-current={active ? "page" : undefined}');
    expect(organizerTabs).toContain("if (target) onSelect(target)");
    expect(organizerTabs).toContain('aria-current={item.active ? "page" : undefined}');
  });
});
