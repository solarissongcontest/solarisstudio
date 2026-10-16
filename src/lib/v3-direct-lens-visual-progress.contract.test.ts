import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 direct lens visual progress contract", () => {
  it("interpolates icon emphasis continuously from the same visible lens displacement", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabbar).toContain("tabIcons: SVGElement[]");
    expect(tabbar).toContain(
      'querySelectorAll<SVGElement>(".v3-liquid-tabbar__icon")',
    );
    expect(tabbar).toContain("const logicalVisualDelta = resolveV3LogicalHorizontalDelta(");
    expect(tabbar).toContain("response.delta,");
    expect(tabbar).toContain("const visualProgress = Math.min(");
    expect(tabbar).toContain(
      "drag.originIndex + logicalVisualDelta / Math.max(1, drag.slotWidth)",
    );
    expect(tabbar).toContain(
      "const weight = Math.max(0, 1 - Math.abs(iconIndex - visualProgress));",
    );
    expect(tabbar).toContain("icon.style.opacity = (0.78 + weight * 0.22).toFixed(4)");
    expect(tabbar).toContain(
      "icon.style.transform = `scale(${(0.97 + weight * 0.05).toFixed(4)})`",
    );
    expect(tabbar).toContain(
      'icon.style.setProperty("stroke-width", (1.9 + weight * 0.35).toFixed(4))',
    );
  });

  it("keeps pointer-move free of layout reads and clears temporary optical state", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");
    const moveDrag = tabbar.slice(
      tabbar.indexOf("const moveDrag ="),
      tabbar.indexOf("const selectDestination ="),
    );

    expect(moveDrag).not.toContain("getBoundingClientRect");
    expect(moveDrag).not.toContain("querySelectorAll");
    expect(moveDrag).toContain("if (nextPreview !== drag.previewIndex)");
    expect(tabbar).toContain('icon.style.removeProperty("opacity")');
    expect(tabbar).toContain('icon.style.removeProperty("transform")');
    expect(tabbar).toContain('icon.style.removeProperty("stroke-width")');
  });

  it("does not change adjacent-only release or semantic navigation ownership", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabbar).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
    expect(tabbar).toContain("onSelect(destination)");
    expect(tabbar).toContain('aria-current={active ? "page" : undefined}');
  });
});
