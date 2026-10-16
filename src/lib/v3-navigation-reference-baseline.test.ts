import { describe, expect, it } from "vitest";

import {
  compareV3NavigationGeometry,
  validateV3NavigationReferenceBaseline,
  type V3NavigationReferenceBaseline,
  type V3NavigationReferenceGeometry,
} from "@/lib/v3-navigation-reference-baseline";

const geometry: V3NavigationReferenceGeometry = {
  shellWidth: 360,
  shellMaxWidth: 544,
  shellHeightExpanded: 70,
  shellHeightCompact: 57,
  horizontalInset: 15,
  bottomInset: 7,
  shellRadius: 32,
  slotWidth: 68,
  iconOpticalSize: 19,
  iconCenterX: [42, 110, 178, 246, 314],
  lensWidth: 66,
  lensHeight: 58,
  lensRadius: 25,
  lensCenterX: 178,
  lensOvershootMax: 14,
  compactWidth: 324,
  compactHeight: 57,
  shadowSpreadBudget: 58,
  viewportWidth: 390,
};

function approvedBaseline(): V3NavigationReferenceBaseline {
  return {
    status: "approved",
    captureDate: "2026-10-16",
    instagramAppVersion: "reference-fixture",
    iosVersion: "reference-fixture",
    iphoneModelOrViewport: "390x844",
    displayScale: 3,
    appearance: "both",
    approvedBy: "reference-fixture",
    states: {
      "expanded-resting": "expanded.png",
      "compact-scrolled": "compact.png",
      "first-selected": "first.png",
      "middle-selected": "middle.png",
      "last-selected": "last.png",
      pressed: "pressed.png",
      "lens-moving": "lens-moving.png",
      dark: "dark.png",
      light: "light.png",
      "high-detail-under-glass": "detail.png",
    },
    geometry,
  };
}

describe("V3 navigation reference baseline", () => {
  it("fails closed until the human-approved N0 package is actually populated", () => {
    const pending: V3NavigationReferenceBaseline = {
      status: "pending",
      captureDate: null,
      instagramAppVersion: null,
      iosVersion: null,
      iphoneModelOrViewport: null,
      displayScale: null,
      appearance: null,
      approvedBy: null,
      states: {},
      geometry: null,
    };

    const result = validateV3NavigationReferenceBaseline(pending);
    expect(result.pass).toBe(false);
    expect(result.failures).toContain("baseline.status must be approved");
    expect(result.failures).toContain("geometry is required");
  });

  it("accepts a complete approved baseline schema", () => {
    expect(validateV3NavigationReferenceBaseline(approvedBaseline())).toEqual({
      pass: true,
      failures: [],
    });
  });

  it("applies the canonical starting tolerances to geometry comparison", () => {
    const withinTolerance: V3NavigationReferenceGeometry = {
      ...geometry,
      shellWidth: geometry.shellWidth + 3.5,
      bottomInset: geometry.bottomInset + 3.5,
      lensCenterX: geometry.lensCenterX + 1.5,
      iconCenterX: geometry.iconCenterX.map((value) => value + 1.5),
    };
    expect(compareV3NavigationGeometry(withinTolerance, geometry).pass).toBe(true);

    const outsideTolerance: V3NavigationReferenceGeometry = {
      ...geometry,
      shellHeightExpanded: geometry.shellHeightExpanded + 5,
      lensCenterX: geometry.lensCenterX + 3,
    };
    const result = compareV3NavigationGeometry(outsideTolerance, geometry);
    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.startsWith("shellHeightExpanded"))).toBe(
      true,
    );
    expect(result.failures.some((failure) => failure.startsWith("lensCenterX"))).toBe(true);
  });
});
