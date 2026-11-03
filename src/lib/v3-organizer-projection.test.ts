import { describe, expect, it } from "vitest";

import type { ControlRoomModel } from "@/lib/control-room-model";
import type { OrganizerTaskV5 } from "@/lib/admin-tasks-v5";
import { buildV3OrganizerProjection } from "@/lib/v3-organizer-projection";

const edition = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ssc-22",
  name: "SSC 22",
  editionNumber: 22,
  status: "active",
};

const live: ControlRoomModel = {
  editionId: edition.id,
  editionName: edition.name,
  editionState: "submissions",
  overallHealth: "healthy",
  subsystems: {
    confirmations: "closed",
    submissions: "open",
    juryVoting: "closed",
    televoting: "closed",
    results: "not_started",
    predictions: "open",
  },
  currentSegment: null,
  nextSegment: null,
  ballots: { received: null, expected: null, completion: null },
  issues: { total: 0, critical: 0, incidents: 0, criticalIncidents: 0 },
  actions: [],
};

function task(
  id: string,
  priority: OrganizerTaskV5["priority"],
  state: OrganizerTaskV5["state"] = "open",
  dueAt: string | null = null,
  assignedTo: string | null = null,
): OrganizerTaskV5 {
  return {
    id,
    editionId: edition.id,
    countryId: null,
    assignedTo,
    sourceKind: "test",
    sourceKey: id,
    taskType: "test",
    priority,
    state,
    title: id,
    description: id,
    href: "/admin/tasks",
    dueAt,
    resolutionPredicate: {},
    ruleReference: [],
    openedAt: `2026-10-14T0${id.length}:00:00Z`,
    resolvedAt: state === "resolved" ? "2026-10-14T10:00:00Z" : null,
    lastEvaluatedAt: "2026-10-14T10:00:00Z",
  };
}

describe("V3 Organizer projection", () => {
  it("projects unresolved canonical tasks and excludes resolved history from pressure", () => {
    const projection = buildV3OrganizerProjection({
      edition,
      actorId: "organizer-1",
      live,
      tasks: [
        task("critical", "critical", "open", "2026-10-15T10:00:00Z"),
        task("high-later", "high", "open", "2026-10-16T10:00:00Z", "organizer-1"),
        task("high-sooner", "high", "waiting", "2026-10-15T09:00:00Z"),
        task("resolved", "critical", "resolved"),
      ],
    });

    expect(projection.tasks).toMatchObject({
      total: 3,
      critical: 1,
      high: 2,
      waiting: 1,
      mine: 1,
    });
    expect(projection.tasks.top.map((item) => item.id)).toEqual([
      "critical",
      "high-sooner",
      "high-later",
    ]);
    expect(projection.risk).toBe("critical");
  });

  it("elevates for live attention even when the task queue is clear", () => {
    const projection = buildV3OrganizerProjection({
      edition,
      actorId: "organizer-1",
      tasks: [],
      live: { ...live, overallHealth: "attention" },
    });
    expect(projection.risk).toBe("elevated");
  });

  it("stays normal only when both live state and unresolved task pressure are clear", () => {
    const projection = buildV3OrganizerProjection({
      edition,
      actorId: "organizer-1",
      tasks: [task("resolved", "critical", "resolved")],
      live,
    });
    expect(projection.tasks.total).toBe(0);
    expect(projection.risk).toBe("normal");
  });

  it("changes projection versions when canonical task actions or readiness change", () => {
    const originalTask = task("review", "high", "open", "2026-11-05T12:00:00Z");
    const base = {
      edition,
      live,
      actorId: "organizer-1",
      tasks: [originalTask],
      serverTime: "2026-11-04T12:00:00Z",
    };
    const version = (input: typeof base) => buildV3OrganizerProjection(input).stateVersion;
    const initial = version(base);

    const changed = [
      { ...base, actorId: "organizer-2" },
      { ...base, tasks: [{ ...originalTask, assignedTo: "organizer-1" }] },
      { ...base, tasks: [{ ...originalTask, dueAt: "2026-11-04T15:00:00Z" }] },
      { ...base, tasks: [{ ...originalTask, title: "Review immediately" }] },
      { ...base, tasks: [{ ...originalTask, description: "Evidence changed" }] },
      { ...base, tasks: [{ ...originalTask, href: "/admin/entries/ssc-22" }] },
      { ...base, tasks: [{ ...originalTask, operationalState: "blocked" as const }] },
      { ...base, live: { ...live, overallHealth: "critical" as const } },
      { ...base, live: { ...live, ballots: { received: 6, expected: 8, completion: 75 } } },
      { ...base, edition: { ...edition, name: "SSC 22 updated" } },
      { ...base, health: { progress: 55, critical_count: 1 } },
      { ...base, activeShow: { id: "show-1", label: "Grand Final", kind: "grand-final", status: "live" } },
      { ...base, contextVersion: 2 },
      { ...base, upcoming: [{ id: "due-1", label: "Jury closes", detail: "Final deadline", at: "2026-11-05T10:00:00Z", route: "/admin/jury/ssc-22" }] },
    ];
    for (const updated of changed) {
      expect(version(updated)).not.toBe(initial);
    }
  });

  it("keeps a stable state version across server-clock-only refreshes", () => {
    const base = {
      edition,
      live,
      actorId: "organizer-1",
      tasks: [task("review", "normal")],
      serverTime: "2026-11-04T12:00:00Z",
    };
    const first = buildV3OrganizerProjection(base).stateVersion;
    const later = buildV3OrganizerProjection({
      ...base,
      serverTime: "2026-11-04T12:05:00Z",
    }).stateVersion;
    expect(later).toBe(first);
  });

});
