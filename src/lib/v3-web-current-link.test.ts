import { describe, expect, it } from "vitest";

import { resolveV3WebNavigationCurrent } from "./v3-web-current-link";

describe("website section link current-location semantics", () => {
  it("announces the actual page only when the URL points to the open page", () => {
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/results", target: "/results" })).toBe("page");
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/", target: "/" })).toBe("page");
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/results/", target: "/results" })).toBe("page");
  });

  it("announces a section rather than claiming a parent root is the current page", () => {
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/records", target: "/results" })).toBe("location");
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/countries/oland", target: "/explore" })).toBe("location");
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/my-solaris/activity", target: "/my-solaris" })).toBe("location");
  });

  it("does not mark inactive destinations as current even if pathnames match", () => {
    expect(resolveV3WebNavigationCurrent({ active: false, pathname: "/results", target: "/results" })).toBeUndefined();
    expect(resolveV3WebNavigationCurrent({ active: false, pathname: "/records", target: "/results" })).toBeUndefined();
  });

  it("recognizes equivalent paths when a section link carries query/hash state", () => {
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/results", target: "/results?edition=22" })).toBe("page");
    expect(resolveV3WebNavigationCurrent({ active: true, pathname: "/results?edition=22", target: "/results" })).toBe("page");
  });
});
