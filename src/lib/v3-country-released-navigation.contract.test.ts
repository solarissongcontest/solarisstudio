import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const country = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
const gate = readFileSync("src/components/v3/V3DelegationRouteGate.tsx", "utf8");

describe("V3 installed Country navigation respects centrally released public destinations", () => {
  it("checks release policy for every supporting destination instead of generic availability", () => {
    expect(country).toContain("const { allowsReleased } = usePublicLaunchAvailability()");
    for (const path of ["/relationships", "/stories", "/countries"]) {
      expect(country).toContain(`allowsReleased("${path}")`);
    }
    for (const item of [
      "projection.resultsDestination",
      "wiki.href",
      "compare.href",
      "entry.editionHref",
      "currentResult.editionHref",
      "currentResult.showHref",
    ]) {
      expect(country).toContain(`allowsReleased(${item})`);
    }
    expect(country).not.toContain("const { allows } = usePublicLaunchAvailability()");
  });

  it("remains spoiler-safe when a published Show is not released as a navigable route", () => {
    expect(country).toContain("hideResultSpoilers ? (");
    expect(country).toContain("allowsReleased(currentResult.showHref) ? <V3ActionCard");
    expect(country).toContain("Spoiler-free mode is hiding this published result.");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection");
    expect(gate).toContain('allowsReleased("/world")');
    expect(gate).toContain("worldRollout.data === true");
  });
});
