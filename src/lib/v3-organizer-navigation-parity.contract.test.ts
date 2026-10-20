import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Organizer navigation N13 parity", () => {
  it("shares Public navigation physics instead of a second Organizer gesture model", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(organizer).toContain("resolveElasticDrag");
    expect(organizer).toContain("rubberBand: true");
    expect(organizer).toContain("resolveV3LogicalHorizontalDelta");
    expect(organizer).toContain("resolveV3NavigationVisualProgress");
    expect(organizer).toContain("resolveV3TabIconVisualState");
    expect(organizer).toContain("velocityProjectionMs: 110");
    expect(organizer).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
  });

  it("pre-measures drag geometry and keeps the pointer hot path compositor-only", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");
    const moveStart = organizer.indexOf("const moveDrag =");
    const finishStart = organizer.indexOf("const finishDrag =", moveStart);
    const move = organizer.slice(moveStart, finishStart);

    expect(organizer).toContain("const rects = tabRects();");
    expect(organizer).toContain("minDelta: Math.min(firstDelta, lastDelta)");
    expect(organizer).toContain("maxDelta: Math.max(firstDelta, lastDelta)");
    expect(move).not.toContain("getBoundingClientRect");
    expect(move).not.toContain("querySelectorAll");
  });

  it("fails gestures closed for keyboard, Reduced Motion and interruption boundaries", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");
    const css = source("src/styles/v3-organizer-navigation.css");

    expect(organizer).toContain("prefersReducedMotion()");
    expect(organizer).toContain('data-solaris-keyboard-open');
    expect(organizer).toContain('data-solaris-feature-overlay-open');
    expect(organizer).toContain("APP_RESUME_EVENT");
    expect(organizer).toContain('window.addEventListener("pagehide"');
    expect(organizer).toContain('window.addEventListener("resize"');
    expect(organizer).toContain("hasPointerCapture");
    expect(organizer).toContain("releasePointerCapture");
    expect(css).toContain("html[data-solaris-keyboard-open]");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("preserves semantic Organizer tabs, badges and exact availability boundaries", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(organizer).toContain("<Link");
    expect(organizer).toContain('aria-current={item.active ? "page" : undefined}');
    expect(organizer).toContain('aria-disabled="true"');
    expect(organizer).toContain('item.availability === "ready" && item.href');
    expect(organizer).toContain("organizerItemLabel(item)");
    expect(organizer).toContain('if (mode === "hidden") return null;');
  });

  it("uses an RTL-safe physical lens without changing logical tab order", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");
    const css = source("src/styles/v3-organizer-navigation.css");

    expect(organizer).toContain('data-layout-direction={layoutDirection}');
    expect(organizer).toContain('layoutDirection === "rtl" ? count - 1 - visualActiveIndex');
    expect(organizer).toContain('left: ".375rem"');
    expect(organizer).toContain('right: "auto"');
    expect(css).toContain(".v6-organizer-tabbar__lens-layer");
    expect(css).toContain("direction: ltr");
    expect(css).toContain("left: .375rem !important");
    expect(css).toContain("right: auto !important");
  });

  it("keeps N13 scoped to navigation rather than Organizer domain authority", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(organizer).not.toContain("supabase");
    expect(organizer).not.toContain("fetch(");
    expect(organizer).not.toContain("mutation");
    expect(organizer).not.toContain("rpc(");
  });
});
