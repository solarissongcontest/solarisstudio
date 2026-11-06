import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canOpenV3EditionResults } from "./v3-edition-results-navigation";

describe("V3 Edition Results navigation", () => {
  it("does not create a self-link when a published result has no destination", () => {
    expect(
      canOpenV3EditionResults({
        state: "available",
        showHref: null,
        spoilerSafe: false,
      }),
    ).toBe(false);
    expect(
      canOpenV3EditionResults({
        state: "available",
        showHref: "   ",
        spoilerSafe: false,
      }),
    ).toBe(false);
  });

  it("preserves valid official result destinations", () => {
    expect(
      canOpenV3EditionResults({
        state: "available",
        showHref: "/results/ssc-22/final",
        spoilerSafe: false,
      }),
    ).toBe(true);
  });

  it("never navigates to locked, empty or spoiler-protected results", () => {
    for (const state of ["locked", "empty"] as const) {
      expect(
        canOpenV3EditionResults({
          state,
          showHref: "/results/ssc-22/final",
          spoilerSafe: false,
        }),
      ).toBe(false);
    }
    expect(
      canOpenV3EditionResults({
        state: "available",
        showHref: "/results/ssc-22/final",
        spoilerSafe: true,
      }),
    ).toBe(false);
  });

  it("uses the navigation guard in the production Edition Overview", () => {
    const source = readFileSync("src/components/v3/V3EditionOverviewScreen.tsx", "utf8");
    expect(source).toContain("canOpenV3EditionResults");
    expect(source).toContain("locked: globalSpoilerProtection || !canOpenV3EditionResults(");
    expect(source).not.toContain("href: projection.results.showHref ?? base,");
  });
});
