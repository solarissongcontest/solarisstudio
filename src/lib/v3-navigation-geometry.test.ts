import { describe, expect, it } from "vitest";

import {
  V3_NAVIGATION_GEOMETRY,
  V3_NAVIGATION_REFERENCE_STATUS,
  v3NavigationGeometryCssVariables,
} from "@/lib/v3-navigation-geometry";

describe("V3 navigation implementation geometry", () => {
  it("keeps implementation measurements separate from the missing approved Instagram baseline", () => {
    expect(V3_NAVIGATION_REFERENCE_STATUS).toEqual({
      status: "awaiting-approved-instagram-baseline",
      referenceValues: null,
    });
  });

  it("publishes fixed CSS-pixel geometry for the installed shell", () => {
    const variables = v3NavigationGeometryCssVariables();

    expect(variables["--v3-nav-shell-max-width"]).toBe(`${V3_NAVIGATION_GEOMETRY.shellMaxWidth}px`);
    expect(variables["--v3-nav-shell-height-expanded"]).toBe(
      `${V3_NAVIGATION_GEOMETRY.shellHeightExpanded}px`,
    );
    expect(variables["--v3-nav-shell-height-compact"]).toBe(
      `${V3_NAVIGATION_GEOMETRY.shellHeightCompact}px`,
    );
    expect(variables["--v3-nav-minimum-target"]).toBe(
      `${V3_NAVIGATION_GEOMETRY.minimumTarget}px`,
    );
  });

  it("retains a 44px minimum compact target while reference calibration remains blocked", () => {
    expect(V3_NAVIGATION_GEOMETRY.minimumTarget).toBeGreaterThanOrEqual(44);
    expect(V3_NAVIGATION_GEOMETRY.itemMinHeightCompact).toBeGreaterThanOrEqual(44);
    expect(V3_NAVIGATION_REFERENCE_STATUS.referenceValues).toBeNull();
  });
});
