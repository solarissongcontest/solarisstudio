import { describe, expect, it } from "vitest";

import { renderMaintenanceDesktopV2Style } from "./maintenance-desktop-v2";

describe("maintenance desktop v2 composition", () => {
  const style = renderMaintenanceDesktopV2Style();

  it("keeps the desktop hero compact and outranks the runtime choreography", () => {
    expect(style).toContain("@media (min-width: 1100px)");
    expect(style).toContain('html[data-terraos-release-choreography="v2"] .hero');
    expect(style).toContain("min-height: clamp(620px, 76svh, 700px) !important");
    expect(style).toContain('html[data-terraos-release-choreography="v2"] .hero-copy');
    expect(style).toContain("position: relative !important");
    expect(style).toContain("top: auto !important");
    expect(style).toContain("grid-template-columns: minmax(420px, 500px) minmax(520px, 640px)");
    expect(style).toContain("width: min(620px, 42vw)");
  });

  it("turns the product stories into bounded desktop editorial compositions", () => {
    expect(style).toContain("width: min(calc(100% - 6rem), 1240px)");
    expect(style).toContain("grid-template-columns: minmax(300px, .68fr) minmax(590px, 1.32fr)");
    expect(style).toContain("min-height: 500px");
    expect(style).toContain("font-size: clamp(3.7rem, 4.65vw, 5.25rem)");
  });

  it("keeps desktop scroll choreography bounded instead of multi-screen dead space", () => {
    expect(style).toContain(
      'html[data-terraos-release-choreography="v2"] [data-terra-first-look="true"] .first-look',
    );
    expect(style).toContain("min-height: 500px !important");
    expect(style).toContain("min-height: 180svh !important");
    expect(style).toContain("min-height: 165svh !important");
    expect(style).toContain("min-height: 150svh !important");
    expect(style).toContain("min-height: 190svh !important");
    expect(style).toContain("position: sticky !important");
  });

  it("does not show the redundant floating local preview nav on desktop", () => {
    expect(style).toContain("#terraos-release-local-nav");
    expect(style).toContain("display: none !important");
  });
});
