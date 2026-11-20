import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Organizer navigation N13 parity", () => {
  it("uses the same canonical Liquid navigation primitive as Public V3", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const shared = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(organizer).toContain("V3LiquidTabBar");
    expect(organizer).not.toContain("OrganizerV6TabBar");
    expect(organizer).toContain("V3_ORGANIZER_TAB_ORDER.map");
    expect(shared).toContain("resolveElasticDrag({");
    expect(shared).toContain("rubberBand: true");
    expect(shared).toContain("resolveV3LogicalHorizontalDelta");
    expect(shared).toContain("resolveV3NavigationVisualProgress");
    expect(shared).toContain("resolveV3TabIconVisualState");
    expect(shared).toContain("velocityProjectionMs: 110");
    expect(shared).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
  });

  it("inherits the shared pre-measured compositor hot path instead of another Organizer gesture engine", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const shared = source("src/components/v3/V3LiquidTabBar.tsx");
    const moveStart = shared.indexOf("const moveDrag =");
    const selectStart = shared.indexOf("const selectDestination =", moveStart);
    const move = shared.slice(moveStart, selectStart);

    expect(organizer).not.toContain("resolveElasticDrag");
    expect(organizer).not.toContain("getBoundingClientRect");
    expect(organizer).not.toContain("setPointerCapture");
    expect(shared).toContain("// Pre-measure once at gesture start.");
    expect(move).not.toContain("getBoundingClientRect");
    expect(move).not.toContain("querySelectorAll");
  });

  it("inherits keyboard, Reduced Motion and interruption safety from the shared primitive", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const shared = source("src/components/v3/V3LiquidTabBar.tsx");
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");
    const organizerCss = source("src/styles/v3-organizer-liquid-tabbar.css");

    expect(organizer).toContain("V3LiquidTabBar");
    expect(shared).toContain("prefersReducedMotion()");
    expect(shared).toContain('data-solaris-keyboard-open');
    expect(shared).toContain('data-solaris-feature-overlay-open');
    expect(shared).toContain("APP_RESUME_EVENT");
    expect(shared).toContain('window.addEventListener("pagehide"');
    expect(shared).toContain('window.addEventListener("resize"');
    expect(shared).toContain("hasPointerCapture");
    expect(shared).toContain("releasePointerCapture");
    expect(liquidCss).toContain("html[data-solaris-keyboard-open]");
    expect(liquidCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(organizerCss).toContain("V3 consumes the same canonical Liquid Glass navigation object as");
  });

  it("preserves the five canonical Organizer destinations, semantic links and task badge", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const shared = source("src/components/v3/V3LiquidTabBar.tsx");

    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      expect(organizer).toContain(`label: "${label}"`);
    }
    expect(organizer).toContain('badge: id === "tasks" ? unresolvedTaskCount : undefined');
    expect(organizer).toContain('if (tabbarMode === "hidden") return null;');
    expect(shared).toContain("<Link");
    expect(shared).toContain('aria-current={active ? "page" : undefined}');
    expect(shared).toContain('aria-label={navigationItemLabel(destination.label, badge)}');
  });

  it("keeps Organizer tab memory and interaction generation scoped to the exact edition", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const navigation = source("src/lib/v3-organizer-navigation.ts");

    expect(organizer).toContain("const navigationScope = activeEdition?.id ?? null");
    expect(organizer).toContain("const navigationMemoryReady = navigationScope != null");
    expect(organizer).toContain('const navigationInteractionKey = navigationScope ?? "unscoped"');
    expect(organizer).toContain("key={navigationInteractionKey}");
    expect(organizer).toContain("consumeV3OrganizerNavigationRestore(");
    expect(organizer).toContain("getV3OrganizerTabDestination(");
    expect(organizer).toContain("resetV3OrganizerTabToRoot(");
    expect(organizer).toContain("markV3OrganizerNavigationRestore(");
    expect(navigation).toContain('return `${STORAGE_PREFIX}:${scopeToken(scopeKey)}`');
    expect(navigation).toContain('return `${RESTORE_PREFIX}:${scopeToken(scopeKey)}`');
  });

  it("keeps Organizer compact mode as geometry adaptation rather than a second navigation implementation", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    const organizerCss = source("src/styles/v3-organizer-liquid-tabbar.css");

    expect(organizer).toContain("resolveV3OrganizerTabbarMode");
    expect(organizer).toContain('data-organizer-v3-tabbar-mode={tabbarMode}');
    expect(organizerCss).toContain('data-organizer-v3-tabbar-mode="compact"');
    expect(organizerCss).toContain(".v3-liquid-tabbar__material");
    expect(organizerCss).toContain("@media (min-width: 900px)");
    expect(organizerCss).not.toContain("pointermove");
    expect(organizerCss).not.toContain("touchmove");
  });

  it("keeps N13 scoped to navigation rather than Organizer domain authority", () => {
    const organizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    expect(organizer).not.toContain("supabase");
    expect(organizer).not.toContain("fetch(");
    expect(organizer).not.toContain("mutation");
    expect(organizer).not.toContain("rpc(");
  });
});
