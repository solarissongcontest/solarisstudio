import { describe, expect, it } from "vitest";

import { shouldOwnNavigationLinkActivation } from "./v3-navigation-link-activation";

const plainActivation = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  defaultPrevented: false,
  metaKey: false,
  shiftKey: false,
};

describe("V3 navigation link activation ownership", () => {
  it("owns an ordinary primary activation so route-memory navigation can run", () => {
    expect(shouldOwnNavigationLinkActivation(plainActivation)).toBe(true);
  });

  it.each([
    ["meta", { metaKey: true }],
    ["control", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
  ])("leaves %s-modified link activation to the browser", (_label, modifier) => {
    expect(
      shouldOwnNavigationLinkActivation({
        ...plainActivation,
        ...modifier,
      }),
    ).toBe(false);
  });

  it("does not steal non-primary or already-handled link activation", () => {
    expect(
      shouldOwnNavigationLinkActivation({
        ...plainActivation,
        button: 1,
      }),
    ).toBe(false);
    expect(
      shouldOwnNavigationLinkActivation({
        ...plainActivation,
        button: 2,
      }),
    ).toBe(false);
    expect(
      shouldOwnNavigationLinkActivation({
        ...plainActivation,
        defaultPrevented: true,
      }),
    ).toBe(false);
  });
});
