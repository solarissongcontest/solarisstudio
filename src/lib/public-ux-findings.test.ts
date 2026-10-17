import { describe, expect, it } from "vitest";

import { buildPublicUxFindings, PUBLIC_UX_SERVER_GAPS } from "./public-ux-findings";
import type { PublicUxMetrics, PublicWebVitalRouteMetric } from "./public-ux-metrics";

function metrics(overrides: Partial<PublicUxMetrics> = {}): PublicUxMetrics {
  return {
    since: "2026-10-01T00:00:00.000Z",
    generatedAt: "2026-10-17T00:00:00.000Z",
    totals: { events: 120, sessions: 40, users: 30 },
    navigation: { topDestinations: [], firstClicks: [] },
    search: {
      opened: 30,
      submitted: 20,
      noResults: 2,
      resultClicks: 14,
      clickedGroups: [],
      queryLengthBuckets: [],
      rescueSessions: 2,
    },
    friction: { highStepSessions: 2, repeatedSectionSessions: 2 },
    tasks: [],
    devices: [],
    ...overrides,
  };
}

describe("Public UX actionable findings", () => {
  it("prioritizes severe search failure without needing raw queries", () => {
    const result = buildPublicUxFindings(metrics({
      search: {
        opened: 30,
        submitted: 20,
        noResults: 8,
        resultClicks: 8,
        clickedGroups: [],
        queryLengthBuckets: [],
        rescueSessions: 4,
      },
    }));

    expect(result[0]).toMatchObject({
      id: "search-no-results",
      tone: "blocked",
    });
    expect(result[0]!.evidence).toContain("40%");
    expect(result[0]!.action).toContain("Raw search text stays unavailable by design");
  });

  it("surfaces low-completion task funnels before secondary friction", () => {
    const result = buildPublicUxFindings(metrics({
      tasks: [
        { target: "confirmation", started: 12, completed: 4, completionRate: 33 },
        { target: "televote", started: 20, completed: 19, completionRate: 95 },
      ],
      friction: { highStepSessions: 8, repeatedSectionSessions: 2 },
    }));

    expect(result.some((item) => item.id === "task-confirmation" && item.tone === "blocked")).toBe(true);
    expect(result.some((item) => item.id === "task-televote")).toBe(false);
  });

  it("turns poor field performance into route/device-specific actions", () => {
    const vitals: PublicWebVitalRouteMetric[] = [
      {
        pathname: "/results",
        metric: "LCP",
        device: "mobile",
        samples: 20,
        p75: 5100,
        good: 2,
        needsImprovement: 4,
        poor: 14,
      },
    ];

    const result = buildPublicUxFindings(metrics(), vitals);
    const finding = result.find((item) => item.id === "vital-/results-LCP-mobile");

    expect(finding).toMatchObject({ tone: "blocked" });
    expect(finding?.evidence).toContain("5.10 s");
    expect(finding?.action).toContain("mobile");
  });

  it("does not convert unavailable canonical signals into fake zeroes", () => {
    expect(PUBLIC_UX_SERVER_GAPS).toEqual([
      "Route backtracking",
      "Dead ends",
      "Workflow abandonment",
      "Error classes",
    ]);
    expect(buildPublicUxFindings(metrics({ totals: { events: 0, sessions: 0, users: 0 } }))).toEqual([]);
  });
});
