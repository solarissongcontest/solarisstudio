import { describe, expect, it } from "vitest";

import { classifyV3Viewport, projectV3ResponsiveLayout } from "./v3-responsive";

describe("V3 responsive layout policy", () => {
  it("classifies the planned viewport bands", () => {
    expect(classifyV3Viewport(360)).toBe("small-phone");
    expect(classifyV3Viewport(390)).toBe("phone");
    expect(classifyV3Viewport(500)).toBe("large-phone");
    expect(classifyV3Viewport(768)).toBe("tablet");
    expect(classifyV3Viewport(1200)).toBe("desktop");
    expect(classifyV3Viewport(1600)).toBe("wide-desktop");
  });

  it("keeps small-phone content single-column and sheets near full screen", () => {
    expect(projectV3ResponsiveLayout({ width: 360, height: 780 })).toMatchObject({
      viewport: "small-phone",
      gutters: 16,
      contentColumns: 1,
      sheetMode: "near-full",
    });
  });

  it("never collapses navigation labels for large-text users", () => {
    expect(
      projectV3ResponsiveLayout({ width: 360, height: 780, largeText: true }),
    ).toMatchObject({
      navigation: "bottom-expanded",
      allowCompactBottomNav: false,
    });
    expect(
      projectV3ResponsiveLayout({ width: 390, height: 844, largeText: true }),
    ).toMatchObject({
      navigation: "bottom-expanded",
      allowCompactBottomNav: false,
    });
  });

  it("uses the standard phone as the primary one-column reference", () => {
    expect(projectV3ResponsiveLayout({ width: 390, height: 844 })).toMatchObject({
      gutters: 20,
      contentColumns: 1,
      navigation: "bottom-expanded",
      sheetMode: "detents",
    });
  });

  it("allows tablet master/detail without pretending it is desktop", () => {
    expect(projectV3ResponsiveLayout({ width: 820, height: 1180 })).toMatchObject({
      viewport: "tablet",
      contentColumns: 2,
      navigation: "bottom-expanded",
      sheetMode: "detents",
    });
  });

  it("gives organizers a context rail on sufficiently wide tablets", () => {
    expect(
      projectV3ResponsiveLayout({ width: 820, height: 1180, organizer: true }),
    ).toMatchObject({ useContextRail: true });
  });

  it("switches desktop to sidebar + context panel architecture", () => {
    expect(
      projectV3ResponsiveLayout({ width: 1200, height: 900, organizer: true }),
    ).toMatchObject({
      navigation: "sidebar",
      contentColumns: 3,
      sheetMode: "dialog-or-panel",
      useContextRail: true,
    });
  });

  it("caps wide-desktop content instead of stretching infinitely", () => {
    expect(projectV3ResponsiveLayout({ width: 1920, height: 1080 })).toMatchObject({
      maxContentWidth: 1440,
      gutters: 48,
    });
  });

  it("rejects invalid viewport widths", () => {
    expect(() => classifyV3Viewport(0)).toThrow("positive viewport width");
  });
});
