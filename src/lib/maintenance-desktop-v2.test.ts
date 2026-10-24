import { describe, expect, it } from "vitest";

import { renderMaintenanceDesktopV2Style } from "./maintenance-desktop-v2";

describe("maintenance desktop v2 composition", () => {
  const style = renderMaintenanceDesktopV2Style();

  it("keeps the desktop hero compact instead of forcing a giant mobile viewport", () => {
    expect(style).toContain("@media (min-width: 1100px)");
    expect(style).toContain("min-height: 720px");
    expect(style).toContain("grid-template-columns: minmax(360px, 455px) minmax(500px, 640px)");
    expect(style).toContain("width: min(640px, 43vw)");
  });

  it("turns the product stories into bounded desktop editorial compositions", () => {
    expect(style).toContain("width: min(calc(100% - 6rem), 1240px)");
    expect(style).toContain("grid-template-columns: minmax(300px, .7fr) minmax(590px, 1.3fr)");
    expect(style).toContain("min-height: 520px");
    expect(style).toContain("font-size: clamp(3.9rem, 4.9vw, 5.6rem)");
  });

  it("prevents sticky mobile storytelling behavior from creating desktop overlap", () => {
    expect(style).toContain(".participation-story .sticky-heading");
    expect(style).toContain("position: relative");
    expect(style).toContain("top: auto");
  });
});
