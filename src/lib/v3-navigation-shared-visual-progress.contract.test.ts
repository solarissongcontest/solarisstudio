import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 shared navigation visual progress contract", () => {
  it("uses one icon optical-state model for Public drag, Organizer drag and page swipe", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const helper = source("src/lib/v3-navigation-visual-progress.ts");

    expect(helper).toContain("export function resolveV3TabIconVisualState");
    expect(publicTabs).toContain("resolveV3TabIconVisualState(iconIndex, visualProgress)");
    expect(organizerTabs).toContain("resolveV3TabIconVisualState(iconIndex, visualProgress)");
    expect(pageSwipe).toContain("resolveV3TabIconVisualState(index, boundedProgress)");

    expect(pageSwipe).not.toContain("0.78 + weight * 0.22");
    expect(pageSwipe).not.toContain("0.97 + weight * 0.05");
  });

  it("keeps page, lens and all icon optics driven by the same bounded page progress", () => {
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(pageSwipe).toContain("--v3-navigation-progress");
    expect(pageSwipe).toContain("const offsetRatio = (activeIndex - boundedProgress) * physicalInlineSign");
    expect(pageSwipe).toContain(
      "(boundedProgress - activeIndex) * state.lensStepWidth * physicalInlineSign",
    );
    expect(pageSwipe).toContain("resolveV3TabIconVisualState(index, boundedProgress)");
    expect(pageSwipe).toContain('"--v3-tab-visual-weight", visualState.weight.toFixed(4)');
    expect(pageSwipe).toContain('"--v3-tab-visual-opacity",');
    expect(pageSwipe).toContain("visualState.opacity.toFixed(4)");
    expect(pageSwipe).toContain('"--v3-tab-visual-scale",');
    expect(pageSwipe).toContain("visualState.scale.toFixed(4)");
    expect(pageSwipe).toContain('"--v3-tab-visual-stroke",');
    expect(pageSwipe).toContain("visualState.strokeWidth.toFixed(4)");
    expect(pageSwipe).toContain('item.style.removeProperty("--v3-tab-visual-stroke")');
    expect(css).toContain("stroke-width: var(--v3-tab-visual-stroke, 1.9)");
  });
});
