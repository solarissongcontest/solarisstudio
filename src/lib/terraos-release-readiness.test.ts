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
    const readiness = getTerraOsPublicReadiness();
    const serialized = JSON.stringify(readiness).toLowerCase();

    const forbiddenPatterns = [
      /\bsha\b/,
      /\bcommit\b/,
      /pull request/,
      /\bpr\s*#/,
      /\bdeployment\b/,
      /\bsupabase\b/,
      /\bdatabase\b/,
      /\bmigration\b/,
      /\bworkflow\b/,
      /\bci\b/,
      /\bblocker\b/,
      /\bregistry\b/,
    ];

    for (const forbidden of forbiddenPatterns) {
      expect(serialized).not.toMatch(forbidden);
    }
  });
});
