import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function stripComments(value: string) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("V3 Liquid navigation text-scale source contract", () => {
  it("loads physical fixed geometry after the decorative Liquid stylesheet", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const liquidImport = 'import "@/styles/v3-liquid-tabbar.css";';
    const fixedImport = 'import "@/styles/v3-navigation-fixed-geometry.css";';

    expect(tabs).toContain(liquidImport);
    expect(tabs).toContain(fixedImport);
    expect(tabs.indexOf(liquidImport)).toBeLessThan(tabs.indexOf(fixedImport));
  });

  it("keeps the fixed navigation geometry independent of root rem scaling", () => {
    const css = stripComments(source("src/styles/v3-navigation-fixed-geometry.css"));

    expect(css).not.toMatch(/(?:^|[^a-z])(?:\d*\.)?\d+rem\b/i);
    expect(css).toContain("height: 70px;");
    expect(css).toContain("min-height: 44px;");
    expect(css).toContain("width: 19px;");
    expect(css).toContain("height: 19px;");
  });

  it("keeps physical lens indicator math in CSS pixels rather than text-relative units", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = tabs.indexOf("const indicatorStyle = {");
    const end = tabs.indexOf("} as CSSProperties;", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const indicator = tabs.slice(start, end);
    expect(indicator).toContain("12px");
    expect(indicator).toContain("2px");
    expect(indicator).toContain('left: "6px"');
    expect(indicator).not.toMatch(/rem\b/i);
  });
});
