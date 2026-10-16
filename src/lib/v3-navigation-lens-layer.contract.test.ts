import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 physical lens overlay contract", () => {
  it("isolates the Public lens from WebKit RTL flex static positioning", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(tabs).toContain('className="v3-liquid-tabbar__lens-layer"');
    expect(tabs).toMatch(/v3-liquid-tabbar__lens-layer[\s\S]*v3-liquid-tabbar__lens/);
    expect(tabs).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex',
    );
    expect(css).toMatch(
      /v3-liquid-tabbar__lens-layer[\s\S]*position: absolute;[\s\S]*top: 0;[\s\S]*right: 0;[\s\S]*bottom: 0;[\s\S]*left: 0;[\s\S]*direction: ltr;[\s\S]*pointer-events: none;/,
    );
    expect(css).toMatch(
      /v3-liquid-tabbar__lens[\s\S]*position: relative !important;[\s\S]*display: block;[\s\S]*left: 6px !important;[\s\S]*right: auto !important;[\s\S]*bottom: auto !important;/,
    );
  });

  it("keeps Organizer on the same isolated physical lens model", () => {
    const tabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const css = source("src/styles/v3-organizer-navigation.css");

    expect(tabs).toContain('className="v6-organizer-tabbar__lens-layer"');
    expect(tabs).toMatch(/v6-organizer-tabbar__lens-layer[\s\S]*v6-organizer-tabbar__lens/);
    expect(tabs).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualActiveIndex : visualActiveIndex',
    );
    expect(css).toMatch(
      /v6-organizer-tabbar__lens-layer[\s\S]*position: absolute;[\s\S]*top: 0;[\s\S]*right: 0;[\s\S]*bottom: 0;[\s\S]*left: 0;[\s\S]*direction: ltr;[\s\S]*pointer-events: none;/,
    );
    expect(css).toMatch(
      /v6-organizer-tabbar__lens[\s\S]*position: relative !important;[\s\S]*display: block;[\s\S]*left: \.375rem !important;[\s\S]*right: auto !important;/,
    );
  });
});
