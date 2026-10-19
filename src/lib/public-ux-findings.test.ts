import { describe, expect, it } from "vitest";

import {
  buildPublicUxFindings,
  publicUxServerGaps,
  PUBLIC_UX_SERVER_GAPS,
} from "./public-ux-findings";
import type {
  PublicUxDiagnostics,
  PublicUxMetrics,
  PublicWebVitalRouteMetric,
} from "./public-ux-metrics";

function diagnostics(overrides: Partial<PublicUxDiagnostics> = {}): PublicUxDiagnostics {
  return {
    definitions: {
      routeBacktracking: "Route definition",
      deadEnds: "Dead-end definition",
      workflowAbandonment: "Abandonment definition",
      errorClasses: "Error definition",
    },
    routeBacktracking: { sessions: 0, events: 0, topDestinations: [] },
    deadEnds: { sessions: 0, topRoutes: [] },
    workflowAbandonment: {
      windowMinutes: 30,
      eligibleStarts: 0,
      abandoned: 0,
      tasks: [],
    },
    errors: { total: 0, classes: [], routes: [] },
    ...overrides,
  };
}

function metrics(overrides: Partial<PublicUxMetrics> = {}): PublicUxMetrics {
  return {
    schemaVersion: 1,
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
    diagnostics: null,
    ...overrides,
  };
}

describe("Public UX actionable findings", () => {
  it("prioritizes severe search failure without needing raw queries", () => {
    const result = buildPublicUxFindings(
      metrics({
        search: {
          opened: 30,
          submitted: 20,
          noResults: 8,
          resultClicks: 8,
          clickedGroups: [],
          queryLengthBuckets: [],
          rescueSessions: 4,
        },
      }),
    );

    expect(result[0]).toMatchObject({
      id: "search-no-results",
      tone: "blocked",
    });
    expect(result[0]!.evidence).toContain("40%");
    expect(result[0]!.action).toContain("Raw search text stays unavailable by design");
  });

  it("surfaces low-completion task funnels before secondary friction", () => {
    const result = buildPublicUxFindings(
      metrics({
        tasks: [
          { target: "confirmation", started: 12, completed: 4, completionRate: 33 },
          { target: "televote", started: 20, completed: 19, completionRate: 95 },
        ],
        friction: { highStepSessions: 8, repeatedSectionSessions: 2 },
      }),
    );

    expect(result.some((item) => item.id === "task-confirmation" && item.tone === "blocked")).toBe(
      true,
    );
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
    const oldProjection = metrics({ totals: { events: 0, sessions: 0, users: 0 } });

    expect(PUBLIC_UX_SERVER_GAPS).toEqual([
      "Route backtracking",
      "Dead ends",
      "Workflow abandonment",
      "Error classes",
    ]);
    expect(publicUxServerGaps(oldProjection)).toEqual(PUBLIC_UX_SERVER_GAPS);
    expect(buildPublicUxFindings(oldProjection)).toEqual([]);
  });

  it("closes server gaps only when schema-v2 diagnostics are actually present", () => {
    const complete = metrics({ schemaVersion: 2, diagnostics: diagnostics() });
    expect(publicUxServerGaps(complete)).toEqual([]);
  });

  it("turns bounded dead-end and abandonment aggregates into actionable findings", () => {
    const complete = metrics({
      schemaVersion: 2,
      diagnostics: diagnostics({
        deadEnds: {
          sessions: 8,
          topRoutes: [{ pathname: "/results", source: "request-failed", count: 5 }],
        },
        workflowAbandonment: {
          windowMinutes: 30,
          eligibleStarts: 10,
          abandoned: 6,
          tasks: [
            {
              target: "entry",
              eligibleStarts: 10,
              abandoned: 6,
              abandonmentRate: 60,
            },
          ],
        },
      }),
    });

    const result = buildPublicUxFindings(complete);
    expect(result.some((item) => item.id === "dead-end-sessions" && item.tone === "blocked")).toBe(
      true,
    );
    expect(result.some((item) => item.id === "abandonment-entry" && item.tone === "blocked")).toBe(
      true,
    );
  });

  it("uses only safe aggregate error classes when prioritizing public failures", () => {
    const complete = metrics({
      schemaVersion: 2,
      diagnostics: diagnostics({
        errors: {
          total: 8,
          classes: [{ errorClass: "request-failed", count: 6 }],
          routes: [{ pathname: "/explore", errorClass: "request-failed", count: 4 }],
        },
      }),
    });

    const finding = buildPublicUxFindings(complete).find((item) => item.id === "public-error-rate");
    expect(finding?.evidence).toContain("request-failed");
    expect(finding?.action).toContain("Error messages, stacks and user payloads are intentionally not available");
  });
});
