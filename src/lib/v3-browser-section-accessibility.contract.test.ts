import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 mobile-browser and desktop section-navigation accessibility", () => {
  it("keeps the mobile website disclosure a labelled navigation landmark with real controlled content", () => {
    const mobile = source("src/components/public/PublicMobileSectionNav.tsx");
    const css = source("src/styles/public-navigation.css");

    expect(mobile).toContain('<nav\n      className="public-mobile-section-nav"');
    expect(mobile).toContain('aria-label={sectionLabel(area) + " navigation"}');
    expect(mobile).toContain('aria-expanded={open}');
    expect(mobile).toContain('aria-controls={"public-mobile-section-panel-" + area}');
    expect(mobile).toContain('hidden={!open}');
    expect(css).toContain(".public-mobile-section-panel[hidden] {\n  display: none;");
    expect(mobile).toContain('useEffect(() => setOpen(false), [pathname])');
  });

  it("lets keyboard users dismiss the mobile disclosure with focus restored to its trigger", () => {
    const mobile = source("src/components/public/PublicMobileSectionNav.tsx");

    expect(mobile).toContain('if (event.key !== "Escape" || !open) return;');
    expect(mobile).toContain("event.preventDefault()");
    expect(mobile).toContain("setOpen(false)");
    expect(mobile).toContain("triggerRef.current?.focus()");
    expect(mobile).toContain("ref={triggerRef}");
  });

  it("keeps advanced section links reachable on tablet web without squeezing touch targets", () => {
    const css = source("src/styles/public-navigation.css");
    const desktop = source("src/components/public/PublicSectionNav.tsx");
    const tablet = css
      .split("@media (min-width: 768px) and (max-width: 1279px) {")[1]
      ?.split("@media (min-width: 1280px) {")[0];

    expect(tablet).toBeTruthy();
    expect(tablet).not.toMatch(/\\.public-site-sidebar details \\{\\s*display: none/);
    expect(tablet).toContain(".public-site-sidebar details[open] > div");
    expect(tablet).toContain("min-height: 2.75rem;");
    expect(desktop).toContain('<details className="group mt-4 border-t border-border/55 pt-3">');
    expect(desktop).toContain("<summary");
    expect(css).toContain(".public-site-sidebar details > summary:focus-visible");
    expect(css).toContain(".public-mobile-section-link:focus-visible");
  });
});
