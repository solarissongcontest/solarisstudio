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
    expect(tablet).not.toContain(".public-site-sidebar details {\n    display: none;");
    expect(tablet).toContain(".public-site-sidebar > nav > details.mt-4.border-t {");
    expect(tablet).toContain(".public-site-sidebar details[open] > div");
    expect(tablet).toContain("min-height: 2.75rem;");
    expect(desktop).toContain("<AdvancedSectionNavigation area={area} items={advanced} activeTo={activeTo}");
    expect(desktop).toContain("const activeIsAdvanced = items.some((item) => item.to === activeTo)");
    expect(desktop).toContain("useState(activeIsAdvanced)");
    expect(desktop).toContain("useEffect(() => setOpen(activeIsAdvanced), [activeIsAdvanced, activeTo])");
    expect(desktop).toContain("useState(collapsible && !activeIsAdvanced)");
    expect(desktop).toContain("if (activeIsAdvanced) setCollapsed(false);");
    expect(desktop).toContain("onToggle={(event) => setOpen(event.currentTarget.open)}");
    expect(desktop).toContain("<summary");
    expect(css).toContain(".public-site-sidebar details > summary:focus-visible");
    expect(css).toContain(".public-mobile-section-link:focus-visible");
  });

  it("wires desktop collapse semantics to the actual nav and keeps focus visible", () => {
    const desktop = source("src/components/public/PublicSectionNav.tsx");
    const css = source("src/styles/public-navigation.css");

    expect(desktop).toContain('aria-controls={`public-section-nav-links-${area}`}');
    expect(desktop).toContain('id={`public-section-nav-links-${area}`}');
    expect(desktop).toContain('aria-label={`${sectionLabel(area)} section links`}');
    expect(desktop).toContain("aria-expanded={!interactiveCollapsed}");
    expect(css).toContain(".public-section-nav-toggle:focus-visible");
    expect(css).toContain(".public-drawer-page-link:focus-visible");
    expect(css).toContain(".public-site-sidebar-link {\n  display: flex;\n  min-height: 2.75rem;");
    expect(css).toContain("min-height: 2.75rem;");
  });

  it("keeps browser section links identifiable with Windows forced-colors enabled", () => {
    const css = source("src/styles/public-navigation.css");
    const highContrast = css.split("@media (forced-colors: active) {")[1];

    expect(highContrast).toBeTruthy();
    expect(highContrast).toContain(".public-mobile-section-trigger:focus-visible");
    expect(highContrast).toContain(".public-section-nav-toggle:focus-visible");
    expect(highContrast).toContain(".public-site-sidebar details > summary:focus-visible");
    expect(highContrast).toContain("outline: 2px solid Highlight;");
    expect(highContrast).toContain(".public-mobile-section-link.is-active,");
    expect(highContrast).toContain(".public-site-sidebar-link.is-active");
    expect(highContrast).toContain("color: HighlightText;");
    expect(highContrast).toContain("background: Highlight;");
    expect(highContrast).toContain("border-inline-start: 3px solid HighlightText;");
  });
});
