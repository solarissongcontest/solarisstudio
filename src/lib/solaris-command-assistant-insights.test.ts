import { describe, expect, it } from "vitest";

import {
  buildCommandAssistantInsight,
  inferCommandAssistantDomain,
} from "./solaris-command-assistant-insights";
import type { V3OrganizerProjection } from "./v3-organizer-projection";

function projection(): V3OrganizerProjection {
  return {
    context: { editionId: "e1", editionSlug: "ssc-22", editionLabel: "SSC 22", showId: null, showLabel: null, mode: "organizer", contextVersion: 1 },
    edition: { id: "e1", slug: "ssc-22", name: "SSC 22", editionNumber: 22, status: "active" },
    readiness: {
      overall: 82,
      blocking: [{ id: "critical-health", label: "Integrity blocker", detail: "1 issue", route: "/admin/tasks?filter=all" }],
      incomplete: [{ id: "results", label: "Results", detail: "1 issue", route: "/admin/results" }],
      ready: [],
      calculatedAt: "2026-10-16T10:00:00Z",
      stateVersion: "v1",
    },
    attention: [],
    tasks: {
      total: 1,
      critical: 1,
      high: 0,
      waiting: 0,
      mine: 0,
      top: [{ id: "t1", priority: "critical", state: "open", title: "Resolve results blocker", description: "Resolve the blocker", href: "/admin/results", dueAt: null, assignedTo: null, openedAt: "2026-10-16T09:00:00Z", lastEvaluatedAt: "2026-10-16T10:00:00Z" }],
    },
    upcoming: [],
    recentChanges: [],
    domains: {
      delegations: { state: "ready", label: "Delegations", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/countries" },
      contest: { state: "ready", label: "Contest", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/shows/ssc-22" },
      voting: { state: "ready", label: "Voting", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/jury/ssc-22" },
      results: { state: "blocked", label: "Results & publication", detail: "1 item needs attention", issueCount: 1, blockingIssueCount: 1, primaryRoute: "/admin/results", recommendedAction: { label: "Resolve results blocker", route: "/admin/results" } },
      communications: { state: "ready", label: "Communications", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/communications" },
      production: { state: "ready", label: "Production", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/control-room" },
      governance: { state: "ready", label: "Governance", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/more" },
      system: { state: "ready", label: "System", detail: "No known action required", issueCount: 0, blockingIssueCount: 0, primaryRoute: "/admin/system" },
    },
    systemHealth: { state: "healthy", detail: "Healthy", issueCount: 0, criticalIssueCount: 0 },
    live: {} as V3OrganizerProjection["live"],
    risk: "critical",
    stateVersion: "v1",
    serverTime: "2026-10-16T10:00:00Z",
  };
}

describe("Command Assistant projection insights", () => {
  it("maps publication questions to the results domain", () => {
    expect(inferCommandAssistantDomain("Why can't I publish results?")).toBe("results");
  });

  it("explains blockers and reuses the canonical recommended action", () => {
    const insight = buildCommandAssistantInsight("Why can't I publish results?", projection());
    expect(insight.domain).toBe("results");
    expect(insight.blockerCount).toBe(1);
    expect(insight.summary).toContain("1 critical blocker requires intervention");
    expect(insight.nextAction).toEqual({ label: "Resolve results blocker", route: "/admin/results" });
  });

  it("falls back to the edition blocker/task projection for generic wording", () => {
    const insight = buildCommandAssistantInsight("What needs my attention?", projection());
    expect(insight.domain).toBe("overview");
    expect(insight.title).toBe("Edition has blocking work");
    expect(insight.nextAction?.route).toBe("/admin/results");
  });
});
