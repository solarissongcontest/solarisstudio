import { describe, expect, it } from "vitest";

import type { EditionReadiness, ReadinessIssue } from "@/lib/admin-readiness";
import type { Studio2IncidentRecord } from "@/lib/studio2-persistence";
import { buildControlRoomAttention } from "./v3-organizer-control-room-attention";

function readiness(issues: EditionReadiness["issues"]): EditionReadiness {
  return {
    status: issues.some((issue) => issue.severity === "critical")
      ? "not_ready"
      : issues.length
        ? "warning"
        : "ready",
    progress: issues.length ? 50 : 100,
    issues,
    areas: [],
  };
}

function issue(input: Pick<ReadinessIssue, "code" | "severity" | "title" | "detail">): ReadinessIssue {
  return {
    ...input,
    area: "live",
    actionLabel: "Open workspace",
    actionHref: "/admin/control-room",
  };
}

function incident(
  id: string,
  severity: "sev1" | "sev2" | "sev3",
  title: string,
  status: Studio2IncidentRecord["status"] = "investigating",
): Studio2IncidentRecord {
  return {
    id,
    editionId: "00000000-0000-4000-8000-00000000e220",
    title,
    severity,
    status,
    category: "other",
    affectedSystems: [],
    description: "",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  } as Studio2IncidentRecord;
}

describe("V3 Organizer Control Room attention model", () => {
  it("puts SEV1 incidents and critical readiness failures before lower-severity incidents", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          code: "broken-results",
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

  it("does not promote warning-only readiness observations into immediate attention", () => {
    const items = buildControlRoomAttention(
      readiness([
        issue({
          code: "tele-warning",
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
        code: "no-shows",
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
