import { describe, expect, it } from "vitest";

import { resolveV3ShellActiveArea } from "./v3-shell-active-area";

describe("Solaris Studio V3 shell active-area authority", () => {
  it("uses Results context for a Show deep link opened from Results", () => {
    expect(resolveV3ShellActiveArea("/shows/show-22", "?from=results")).toBe(
      "results",
    );
  });

  it("uses Explore for the same Show deep link without Results context", () => {
    expect(resolveV3ShellActiveArea("/shows/show-22", "")).toBe("explore");
  });

  it.each([
    ["/", "", "home"],
    ["/explore", "", "explore"],
    ["/participate", "", "participate"],
    ["/results", "", "results"],
    ["/my-solaris", "", "me"],
    ["/televoting/results", "", "results"],
    ["/confirmations", "", "participate"],
  ] as const)("resolves %s to canonical root tab %s", (pathname, search, expected) => {
    expect(resolveV3ShellActiveArea(pathname, search)).toBe(expected);
  });

  it("returns no active tab for unknown fallback routes", () => {
    expect(resolveV3ShellActiveArea("/definitely-not-real")).toBeNull();
  });

  it("rejects non-absolute input rather than guessing route hierarchy", () => {
    expect(() => resolveV3ShellActiveArea("results")).toThrow(
      "V3 shell active-area resolution requires an absolute pathname",
    );
  });
});
