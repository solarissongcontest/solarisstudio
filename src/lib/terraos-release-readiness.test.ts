import { describe, expect, it } from "vitest";
import { getTerraOsPublicReadiness } from "./terraos-release-readiness";

describe("TerraOS public readiness projection", () => {
  it("returns only the sanitized public readiness shape", () => {
    const readiness = getTerraOsPublicReadiness();

    expect(Object.keys(readiness).sort()).toEqual(["percent", "stage"]);
    expect(readiness.percent).toBeGreaterThanOrEqual(0);
    expect(readiness.percent).toBeLessThanOrEqual(98);
    expect(readiness.stage.length).toBeGreaterThan(0);
  });

  it("never exposes internal implementation metadata through the public value", () => {
    const serialized = JSON.stringify(getTerraOsPublicReadiness()).toLowerCase();

    for (const forbidden of [
      "sha",
      "commit",
      "pull request",
      "pr #",
      "deployment",
      "supabase",
      "database",
      "migration",
      "workflow",
      "ci",
      "blocker",
      "registry",
    ]) {
      // Match metadata words, not substrings such as sha in "shape".
      expect(serialized).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
    }
  });
});
