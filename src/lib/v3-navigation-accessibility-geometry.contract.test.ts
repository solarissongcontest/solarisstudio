import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
const publicGeometry = source("src/styles/v3-navigation-fixed-geometry.css");
const publicMaterial = source("src/styles/v3-liquid-tabbar.css");
const responsiveShell = source("src/styles/v3-responsive-shell.css");
const canonicalOrganizer = source("src/components/admin/OrganizerV3MobileChrome.tsx");
const organizerLiquid = source("src/styles/v3-organizer-liquid-tabbar.css");
const legacyOrganizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
const legacyOrganizerCss = source("src/styles/v3-organizer-navigation.css");

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

  it("keeps canonical Organizer V3 on the same fixed compact geometry instead of reintroducing rem scaling", () => {
    expect(canonicalOrganizer).toContain("V3LiquidTabBar");
    expect(organizerLiquid).toContain("height: 57px");
    expect(organizerLiquid).toContain("min-height: 44px");
    expect(organizerLiquid).toContain("width: 22px");
    expect(organizerLiquid).toContain("height: 22px");
    expect(organizerLiquid).toContain("width: 17px");
    expect(organizerLiquid).toContain("height: 17px");
    expect(organizerLiquid).not.toContain("height: 3.55rem");
    expect(organizerLiquid).not.toContain("min-height: 2.75rem");
  });

  it("keeps shared top and floating navigation on the canonical safe-area aliases", () => {
    expect(responsiveShell).toContain("var(--solaris-safe-right");
    expect(responsiveShell).toContain("var(--solaris-safe-left");
    expect(publicGeometry).toContain("var(--solaris-safe-right");
    expect(publicGeometry).toContain("var(--solaris-safe-left");
    expect(publicGeometry).toContain("var(--solaris-safe-bottom");
    expect(organizerLiquid).toContain("var(--solaris-safe-left");
    expect(organizerLiquid).toContain("var(--solaris-safe-right");
    expect(legacyOrganizerTabs).toContain("var(--solaris-safe-bottom");
  });

  it("keeps Public destinations semantic and exposes current state without requiring gestures", () => {
    expect(publicTabs).toContain("<Link");
    expect(publicTabs).toContain("aria-current={active ? \"page\" : undefined}");
    expect(publicTabs).toContain("aria-label={navigationItemLabel(destination.label, badge)}");
    expect(publicTabs).toContain("onClick");
  });

  it("keeps legacy-transition Organizer compact destinations at 44px while V3 rollout converges on the shared Liquid primitive", () => {
    expect(legacyOrganizerTabs).toContain("min-h-[44px]");
    expect(legacyOrganizerTabs).toContain('compact && "sr-only"');
    expect(legacyOrganizerTabs).toContain("aria-current={item.active ? \"page\" : undefined}");
    expect(legacyOrganizerTabs).toContain("aria-label={organizerItemLabel(item)}");
    expect(canonicalOrganizer).toContain("V3_ORGANIZER_TAB_ORDER.map");
  });

  it("honors Reduced Motion and Reduced Transparency in canonical Public/V3 Organizer and legacy transition chrome", () => {
    expect(publicMaterial).toContain("@media (prefers-reduced-motion: reduce)");
    expect(publicMaterial).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(canonicalOrganizer).toContain("V3LiquidTabBar");
    expect(legacyOrganizerTabs).toContain("prefersReducedMotion()");
    expect(legacyOrganizerCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(legacyOrganizerCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(legacyOrganizerCss).toContain("backdrop-filter: none !important");
  });

  it("keeps visible keyboard focus on canonical Public/V3 Organizer and legacy transition navigation", () => {
    expect(publicMaterial).toContain(".v3-liquid-tabbar__item:focus-visible");
    expect(canonicalOrganizer).toContain("V3LiquidTabBar");
    expect(legacyOrganizerCss).toContain("[data-organizer-tab-index]:focus-visible");
  });
});
