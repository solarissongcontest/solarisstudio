import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
const publicGeometry = source("src/styles/v3-navigation-fixed-geometry.css");
const publicMaterial = source("src/styles/v3-liquid-tabbar.css");
const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
const organizerCss = source("src/styles/v3-organizer-navigation.css");

describe("V3 navigation accessibility geometry", () => {
  it("keeps Public icon-only navigation physical geometry independent of text scaling", () => {
    expect(publicGeometry).toContain("height: 70px");
    expect(publicGeometry).toContain("min-height: 57px");
    expect(publicGeometry).toContain("min-height: 44px");
    expect(publicGeometry).toContain("width: 19px");
    expect(publicGeometry).toContain("height: 19px");
    expect(publicMaterial).toContain(".v3-liquid-tabbar__label");
    expect(publicMaterial).toContain("clip-path: inset(50%)");
  });

  it("keeps Public destinations semantic and exposes current state without requiring gestures", () => {
    expect(publicTabs).toContain("<Link");
    expect(publicTabs).toContain("aria-current={active ? \"page\" : undefined}");
    expect(publicTabs).toContain("aria-label={navigationItemLabel(destination.label, badge)}");
    expect(publicTabs).toContain("onClick");
  });

  it("keeps Organizer compact destinations at 44px even when labels collapse visually", () => {
    expect(organizerTabs).toContain("min-h-[44px]");
    expect(organizerTabs).toContain('compact && "sr-only"');
    expect(organizerTabs).toContain("aria-current={item.active ? \"page\" : undefined}");
    expect(organizerTabs).toContain("aria-label={organizerItemLabel(item)}");
  });

  it("honors Reduced Motion and Reduced Transparency in both navigation materials", () => {
    expect(publicMaterial).toContain("@media (prefers-reduced-motion: reduce)");
    expect(publicMaterial).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(organizerTabs).toContain("prefersReducedMotion()");
    expect(organizerCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(organizerCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(organizerCss).toContain("backdrop-filter: none !important");
  });

  it("keeps visible keyboard focus on both Public and Organizer navigation", () => {
    expect(publicMaterial).toContain(".v3-liquid-tabbar__item:focus-visible");
    expect(organizerCss).toContain("[data-organizer-tab-index]:focus-visible");
  });
});
