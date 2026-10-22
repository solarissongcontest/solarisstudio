import { describe, expect, it } from "vitest";
import {
  parseV3ResultLabScenario,
  serializeV3ResultLabScenario,
} from "./v3-result-lab-scenario";

describe("V3 Result Lab shareable scenario", () => {
  it("round-trips bounded hypothetical controls without official result data", () => {
    const query = serializeV3ResultLabScenario({
      showId: "show-22-final",
      juryWeight: 35,
      blendMode: "normalized",
      juryScheme: "classic",
      tieBreak: "jury",
      excludedVoters: new Set(["c:oland", "v:juror-2"]),
    });

    expect(query).toContain("show=show-22-final");
    expect(query).toContain("jw=35");
    expect(query).toContain("blend=normalized");
    expect(query).toContain("jury=classic");
    expect(query).toContain("tie=jury");
    expect(query).not.toMatch(/points|rank|winner|resultVersion/i);

    const restored = parseV3ResultLabScenario(query);
    expect(restored.showId).toBe("show-22-final");
    expect(restored.juryWeight).toBe(35);
    expect(restored.blendMode).toBe("normalized");
    expect(restored.juryScheme).toBe("classic");
    expect(restored.tieBreak).toBe("jury");
    expect([...restored.excludedVoters].sort()).toEqual(["c:oland", "v:juror-2"]);
  });

  it("fails malformed controls back to safe simulation defaults", () => {
    const restored = parseV3ResultLabScenario(
      "?show=&jw=999&blend=hack&jury=private&tie=random",
    );

    expect(restored.showId).toBeNull();
    expect(restored.juryWeight).toBe(100);
    expect(restored.blendMode).toBe("raw");
    expect(restored.juryScheme).toBe("original");
    expect(restored.tieBreak).toBe("televote");
  });

  it("bounds excluded voter keys and show identity input", () => {
    const voters = Array.from({ length: 80 }, (_, index) => `v:${index}`).join(",");
    const restored = parseV3ResultLabScenario(
      `?show=${"s".repeat(200)}&exclude=${encodeURIComponent(voters)}`,
    );

    expect(restored.showId).toBeNull();
    expect(restored.excludedVoters.size).toBe(50);
  });

  it("omits default controls from shared URLs", () => {
    expect(
      serializeV3ResultLabScenario({
        showId: "show-final",
        juryWeight: 50,
        blendMode: "raw",
        juryScheme: "original",
        tieBreak: "televote",
        excludedVoters: new Set(),
      }),
    ).toBe("?show=show-final");
  });
});
