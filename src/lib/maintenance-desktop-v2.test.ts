import { describe, expect, it } from "vitest";

import { renderMaintenanceDesktopV2Style } from "./maintenance-desktop-v2";

describe("maintenance desktop v2 composition", () => {
  const style = renderMaintenanceDesktopV2Style();

  it("owns desktop hero geometry from first paint as well as after choreography boots", () => {
    expect(style).toContain("@media (min-width: 1100px)");
    expect(style).toContain(".hero,\n    html[data-terraos-release-choreography=\"v2\"] .hero");
    expect(style).toContain("min-height: 700px !important");
    expect(style).toContain("height: auto !important");
    expect(style).toContain("grid-template-columns: minmax(400px, 480px) minmax(520px, 650px) !important");
    expect(style).toContain(".hero-copy,\n    html[data-terraos-release-choreography=\"v2\"] .hero-copy");
    expect(style).toContain("position: relative !important");
    expect(style).toContain("top: auto !important");
  });

  it("keeps the first fold balanced instead of vertically centering inside a 920px shell", () => {
    expect(style).toContain("height: 460px !important");
    expect(style).toContain("font-size: clamp(4.8rem, 5.5vw, 6.5rem) !important");
    expect(style).toContain("width: min(640px, 43vw) !important");
    expect(style).toContain("margin: clamp(1.55rem, 2.4vh, 2rem) 0 0 !important");
    expect(style).toContain("@media (min-width: 1100px) and (max-height: 820px)");
    expect(style).toContain("min-height: 620px !important");
  });

  it("turns product stories into bounded desktop grids", () => {
    expect(style).toContain("width: min(calc(100% - 6rem), 1240px) !important");
    expect(style).toContain(".product-story > .story:first-child {\n      display: grid !important;");
    expect(style).toContain(".story-touch,\n    .participation-story .story-grid {\n      display: grid !important;");
    expect(style).toContain("grid-template-columns: minmax(290px, .7fr) minmax(560px, 1.3fr) !important");
    expect(style).toContain("min-height: 470px !important");
  });

  it("keeps the first-look phone fully visible on short desktop viewports", () => {
    expect(style).toContain(".preview-device,\n    html[data-terraos-release-choreography=\"v2\"] [data-terra-first-look=\"true\"] .preview-device");
    expect(style).toContain("width: min(268px, 18vw, 100%) !important");
    expect(style).toContain("max-height: min(600px, 78svh) !important");
  });

  it("keeps desktop scroll choreography bounded instead of creating huge dead zones", () => {
    expect(style).toContain("min-height: 155svh !important");
    expect(style).toContain("min-height: 150svh !important");
    expect(style).toContain("min-height: 138svh !important");
    expect(style).toContain("min-height: 165svh !important");
    expect(style).toContain("position: sticky !important");
  });

  it("keeps reduced-motion desktop scenes static and auto-height", () => {
    expect(style).toContain(
      'html[data-terraos-release-choreography="v2"][data-terraos-reduced-motion="true"] .hero',
    );
    expect(style).toContain("min-height: auto !important");
    expect(style).toContain("position: static !important");
  });

  it("does not show the redundant floating local preview nav on desktop", () => {
    expect(style).toContain("#terraos-release-local-nav");
    expect(style).toContain("display: none !important");
  });
});
