import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 icon-only navigation text-scale geometry", () => {
  it("loads a physical pixel geometry layer after the visual material stylesheet", () => {
    const tabs = read("src/components/v3/V3LiquidTabBar.tsx");
    const materialImport = tabs.indexOf('import "@/styles/v3-liquid-tabbar.css"');
    const fixedImport = tabs.indexOf('import "@/styles/v3-navigation-fixed-geometry.css"');

    expect(materialImport).toBeGreaterThan(-1);
    expect(fixedImport).toBeGreaterThan(materialImport);
  });

  it("keeps lens spacing independent from root rem scaling", () => {
    const tabs = read("src/components/v3/V3LiquidTabBar.tsx");
    const indicatorStart = tabs.indexOf("const indicatorStyle =");
    const indicatorEnd = tabs.indexOf("return (", indicatorStart);
    const indicator = tabs.slice(indicatorStart, indicatorEnd);

    expect(indicator).toContain("12px");
    expect(indicator).toContain("2px");
    expect(indicator).not.toContain(".76rem");
    expect(indicator).not.toContain(".14rem");
  });

  it("pins the icon-only shell, compact state, targets and icons to CSS pixels", () => {
    const css = read("src/styles/v3-navigation-fixed-geometry.css");

    for (const token of [
      "width: min(calc(100% - 22px), 544px)",
      "height: 70px",
      "padding: 6px",
      "border-radius: 32px",
      "min-height: 57px",
      "width: 25px",
      "height: 25px",
      "width: 19px",
      "height: 19px",
      "width: min(324px",
      "height: 57px",
      "min-height: 44px",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("browser certification scales the root font rather than only body text", () => {
    const e2e = read("e2e/v3-navigation/route-memory-installed-app.e2e.ts");

    expect(e2e).toContain('document.documentElement.style.fontSize = "200%"');
    expect(e2e).toContain("lensCenterX");
    expect(e2e).toContain("activeCenterX");
    expect(e2e).toContain("iconWidth");
    expect(e2e).not.toContain('document.body.style.fontSize = "200%"');
  });
});
