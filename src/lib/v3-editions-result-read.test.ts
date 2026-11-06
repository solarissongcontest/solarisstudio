import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canStartPublishedEditionResultsRead } from "./v3-editions-result-read";

describe("V3 Edition directory result-read lifecycle", () => {
  it("starts no archive read before runtime resolution regardless of assumed mode", () => {
    for (const app of [false, true]) {
      for (const ready of [false, true]) {
        expect(canStartPublishedEditionResultsRead(false, app, ready)).toBe(false);
      }
    }
  });

  it("allows the published website directory once web mode is resolved", () => {
    expect(canStartPublishedEditionResultsRead(true, false, false)).toBe(true);
  });

  it("defers the installed app read until its existing idle callback releases it", () => {
    expect(canStartPublishedEditionResultsRead(true, true, false)).toBe(false);
    expect(canStartPublishedEditionResultsRead(true, true, true)).toBe(true);
  });

  it("wires the gated query into the route, not a default-web initializer", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/editions/index.tsx"), "utf8");
    expect(source).toContain("useState(false)");
    expect(source).not.toContain("useState(!isAppMode)");
    expect(source).toContain("canStartPublishedEditionResultsRead(platformResolved, isAppMode, resultsEnabled)");
    expect(source).toContain("if (!platformResolved || !isAppMode) return");
    expect(source).toContain("requestIdleCallback");
    expect(source).toContain("cancelIdleCallback");
    expect(source).toContain("useAllResults({");
  });
});
