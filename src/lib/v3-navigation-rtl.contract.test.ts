import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation RTL integration contract", () => {
  it("keeps whole-page progress logical while mirroring physical composition", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(swipe).toContain("type V3LayoutDirection");
    expect(swipe).toContain("layoutDirection: V3LayoutDirection");
    expect(swipe).toContain("layoutDirection: layoutDirectionFor(event.currentTarget)");
    expect(swipe).toContain("direction: drag.layoutDirection");
    expect(swipe).toContain("resolveV3PhysicalInlineSign(state.layoutDirection)");
    expect(swipe).toMatch(
      /const offsetRatio = \(activeIndex - boundedProgress\) \* physicalInlineSign/,
    );
    expect(swipe).toMatch(
      /\(boundedProgress - activeIndex\) \* state\.lensStepWidth \* physicalInlineSign/,
    );
    expect(css).toContain(".v3-top-level-swipe-surface:dir(rtl)");
    expect(css).toMatch(/:dir\(rtl\)[\s\S]*page--previous[\s\S]*translate3d\(100%/);
    expect(css).toMatch(/:dir\(rtl\)[\s\S]*page--next[\s\S]*translate3d\(-100%/);
  });
});
