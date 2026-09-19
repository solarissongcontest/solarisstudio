import { describe, expect, it } from "vitest";

import {
  evaluateBeta3FirstClickEvidence,
  matchesExpectedTarget,
} from "./beta3-release-evidence";

describe("Beta 3 first-click evidence", () => {
  it("accepts an exact route or a descendant of an expected route", () => {
    expect(matchesExpectedTarget("/results", ["/results"])).toBe(true);
    expect(matchesExpectedTarget("/results/ssc21", ["/results"])).toBe(true);
    expect(matchesExpectedTarget("/countries/OLA", ["/countries"])).toBe(true);
    expect(matchesExpectedTarget("/rules", ["/results"])).toBe(false);
  });

  it("scores missing first clicks as release-gate failures rather than hiding them", () => {
    const result = evaluateBeta3FirstClickEvidence(
      {
        since: "2026-09-19T00:00:00Z",
        runs: [
          { task: "a", started: 3 },
          { task: "b", started: 1 },
        ],
        firstClicks: [
          { task: "a", target: "/results", count: 2 },
          { task: "b", target: "/rules", count: 1 },
        ],
      },
      {
        a: ["/results"],
        b: ["/results"],
      },
    );

    expect(result.started).toBe(4);
    expect(result.observed).toBe(3);
    expect(result.successful).toBe(2);
    expect(result.successRate).toBe(50);
    expect(result.coveragePercent).toBe(75);
  });

  it("ignores telemetry for tasks outside the Beta 3 release study", () => {
    const result = evaluateBeta3FirstClickEvidence(
      {
        since: "2026-09-19T00:00:00Z",
        runs: [
          { task: "known", started: 2 },
          { task: "other", started: 50 },
        ],
        firstClicks: [
          { task: "known", target: "/participate", count: 2 },
          { task: "other", target: "/wrong", count: 50 },
        ],
      },
      { known: ["/participate"] },
    );

    expect(result.started).toBe(2);
    expect(result.successful).toBe(2);
    expect(result.successRate).toBe(100);
  });
});
