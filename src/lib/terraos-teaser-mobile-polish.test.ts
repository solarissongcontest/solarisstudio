import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TERRAOS_COMPACT_PREVIEW_MEDIA,
  isTerraOsCompactPreviewWidth,
} from "./terraos-teaser-mobile-polish";

const polishSource = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-mobile-polish.ts"), "utf8");
const accessibilitySource = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/terraos-teaser-mobile-accessibility.ts"),
    "utf8",
  );
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS mobile teaser composition", () => {
  it("uses the compact breakpoint consistently", () => {
    expect(TERRAOS_COMPACT_PREVIEW_MEDIA).toBe("(max-width: 560px)");
    expect(isTerraOsCompactPreviewWidth(320)).toBe(true);
    expect(isTerraOsCompactPreviewWidth(390)).toBe(true);
    expect(isTerraOsCompactPreviewWidth(560)).toBe(true);
    expect(isTerraOsCompactPreviewWidth(561)).toBe(false);
    expect(isTerraOsCompactPreviewWidth(Number.NaN)).toBe(false);
  });

  it("bounds the cinematic mobile scene lengths instead of preserving multi-viewport dead zones", () => {
    const source = polishSource();

    expect(source).toContain("min-height: 210svh !important");
    expect(source).toContain("min-height: 178svh !important");
    expect(source).toContain("min-height: 150svh !important");
    expect(source).toContain("min-height: 188svh !important");
    expect(source).not.toContain("min-height: 360svh");
    expect(source).not.toContain("min-height: 300svh");
    expect(source).not.toContain("min-height: 270svh");
  });

  it("collapses those mobile scene budgets again for Reduce Motion", () => {
    const source = accessibilitySource();

    expect(source).toContain('data-terraos-reduced-motion="true"');
    expect(source).toContain("min-height: auto !important");
    expect(source).toContain("position: static !important");
    expect(source).toContain("transform: none !important");
  });

  it("keeps the mobile Results detail treatment compact instead of stacking three giant cards", () => {
    const source = polishSource();

    expect(source).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(source).toContain("min-height: 128px");
    expect(source).toContain("font-size: 3.35rem");
  });

  it("keeps the fixture navigation icon-first without removing its accessible labels", () => {
    const source = polishSource();

    expect(source).toContain("[data-terraos-teaser-preview] .v3-bottom-nav__label");
    expect(source).toContain("position: absolute !important");
    expect(source).toContain("clip: rect(0, 0, 0, 0) !important");
    expect(source).not.toContain(".v3-bottom-nav__label {\n  display: none");
  });

  it("installs teaser-only polish and disables the fixed hero handoff at phone widths", () => {
    const route = routeSource();

    expect(route).toContain("installTerraOsTeaserPreviewPolish(document)");
    expect(route).toContain("installTerraOsTeaserHostMobilePolish(frame)");
    expect(route).toContain("installTerraOsTeaserMobileAccessibility");
    expect(route).toContain("matchMedia(TERRAOS_COMPACT_PREVIEW_MEDIA)");
    expect(route).toContain("compactMedia?.matches");
    expect(route).toContain(": installTerraOsTeaserHeroHandoff(frame)");
  });

  it("remains presentation-only and cannot introduce a production data path", () => {
    const source = `${polishSource()}\n${accessibilitySource()}`.toLowerCase();

    expect(source).not.toContain("supabase.co");
    expect(source).not.toContain("createclient(");
    expect(source).not.toContain("fetch(");
  });
});
