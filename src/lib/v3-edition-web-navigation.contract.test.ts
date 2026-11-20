import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Edition browser-native editorial navigation", () => {
  it("shows all available published section links on ordinary web", () => {
    const route = read("src/routes/editions/$slug.tsx");
    const primitive = read("src/components/edition/EditionPublicPrimitives.tsx");
    expect(route).toContain("editorialWeb={!isAppMode}");
    expect(primitive).toContain("editorialWeb = false");
    expect(primitive).toContain('className="edition-navigation edition-navigation--editorial"');
    expect(primitive).toContain('className="edition-navigation-editorial"');
    expect(primitive).toContain("{available.map(link)}");
    expect(primitive).toContain('aria-current={active === item.href ? "location" : undefined}');
  });

  it("preserves original app nav, official artwork, and publication gating", () => {
    const primitive = read("src/components/edition/EditionPublicPrimitives.tsx");
    const route = read("src/routes/editions/$slug.tsx");
    expect(primitive).toContain('className="edition-navigation-mobile"');
    expect(primitive).toContain("primary.map(link)");
    expect(primitive).toContain("secondary.map(link)");
    expect(route).toContain("artwork={edition.artwork_url ?? null}");
    expect(route).toContain("resolveShowPublication");
    expect(route).toContain("grandFinalPublication?.results");
  });

  it("keeps the new presentation browser-only and keyboard accessible", () => {
    const css = read("src/styles/v3-visual-editorial-redesign.css");
    expect(css).toContain("html:not([data-solaris-app]) .edition-editorial-refresh .edition-navigation--editorial");
    expect(css).toContain("html:not([data-solaris-app]) .edition-editorial-refresh .edition-navigation-editorial a:focus-visible");
    expect(css).toContain('a[aria-current="location"]');
    expect(css).toContain("min-height: 48px");
    expect(css).toContain("overflow-x: auto");
  });
});
