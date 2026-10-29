import { describe, expect, it } from "vitest";

import type { AdminIssue, EditionReadiness } from "@/lib/admin-readiness";
import type { Studio2IncidentRecord } from "@/lib/studio2-persistence";
import { buildControlRoomAttention } from "./v3-organizer-control-room-attention";

function readiness(issues: EditionReadiness["issues"]): EditionReadiness {
  return {
    status: issues.some((issue) => issue.severity === "critical")
      ? "blocked"
      : issues.length
        ? "needs-attention"
        : "ready",
    progress: issues.length ? 50 : 100,
    issues,
    areas: [],
  };
}

function issue(input: Pick<AdminIssue, "id" | "severity" | "title" | "detail">): AdminIssue {
  return {
    ...input,
    area: "setup",
  };
}

function incident(
  id: string,
  severity: "sev1" | "sev2" | "sev3",
  title: string,
  status: Studio2IncidentRecord["status"] = "investigating",
): Studio2IncidentRecord {
  const occurredAt = "2026-10-18T00:00:00.000Z";
  return {
    id,
    editionId: "00000000-0000-4000-8000-00000000e220",
    title,
    severity,
    status,
    startedAt: occurredAt,
    resolvedAt: status === "resolved" ? "2026-10-18T00:30:00.000Z" : null,
    category: "other",
    affectedSystems: [],
    description: "",
    commanderId: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolution: status === "resolved" ? "Resolved for fixture" : null,
    postmortem: null,
    crisisDeclaredAt: null,
    crisisDeclaredBy: null,
    createdBy: null,
    updatedBy: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

describe("V3 Organizer Control Room attention model", () => {
  it("puts SEV1 incidents and critical readiness failures before lower-severity incidents", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          id: "broken-results",
          severity: "critical",
          title: "Results do not reconcile",
          detail: "Totals are inconsistent.",
        }),
      ]),
      [
        incident("incident-2", "sev2", "Graphics degraded"),
        incident("incident-1", "sev1", "Voting unavailable"),
      ],
    );

    expect(items.map((item) => item.id)).toEqual([
      "incident:incident-1",
      "readiness:broken-results",
      "incident:incident-2",
    ]);
  });

  it("promotes action readiness after critical exceptions but before warnings", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          id: "running-order",
          severity: "action",
          title: "Running order incomplete",
          detail: "Place every entry before the show.",
        }),
      ]),
      [incident("incident-3", "sev3", "Minor display issue")],
    );

    expect(items.map((item) => item.id)).toEqual([
      "readiness:running-order",
      "incident:incident-3",
    ]);
  });

  it("routes incidents to Incident Command and readiness exceptions to canonical Control", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          id: "running-order",
          severity: "action",
          title: "Running order incomplete",
          detail: "Place every entry before the show.",
        }),
      ]),
      [incident("incident with spaces", "sev2", "Graphics degraded")],
    );

    expect(items.find((item) => item.kind === "incident")).toMatchObject({
      route: "/admin/incidents?incident=incident%20with%20spaces",
      actionLabel: "Open incident",
    });
    expect(items.find((item) => item.kind === "readiness")).toMatchObject({
      route: "/admin/control",
      actionLabel: "Open Control",
    });
  });

  it("does not promote warning-only readiness observations into immediate attention", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          id: "tele-warning",
          severity: "warning",
          title: "No televote data yet",
          detail: "No voting activity has started.",
        }),
      ]),
      [],
    );

    expect(items).toEqual([]);
  });

  it("excludes resolved incidents from immediate attention", () => {
    const items = buildControlRoomAttention(null, [
      incident("resolved-sev1", "sev1", "Old voting outage", "resolved"),
      incident("active-sev2", "sev2", "Graphics degraded"),
    ]);

    expect(items.map((item) => item.id)).toEqual(["incident:active-sev2"]);
  });

  it("keeps the model read-only and deterministic", () => {
    const source = readiness([
      issue({
        id: "no-shows",
        severity: "critical",
        title: "No shows created",
        detail: "Create a show before operating the edition.",
      }),
    ]);
    const first = buildControlRoomAttention(source, []);
    const second = buildControlRoomAttention(source, []);

    expect(first).toEqual(second);
    expect(source.issues).toHaveLength(1);
  });
});
