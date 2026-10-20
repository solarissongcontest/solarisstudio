import { describe, expect, it, vi } from "vitest";

import {
  loadOrganizerTasksV3,
  mapOrganizerTaskProjectionV3,
  type OrganizerTaskProjectionV3,
} from "./admin-tasks-v3";

const EDITION_ID = "00000000-0000-4000-8000-00000000e220";

function payload(
  overrides: Partial<OrganizerTaskProjectionV3> = {},
): OrganizerTaskProjectionV3 {
  return {
    schemaVersion: 1,
    editionId: EDITION_ID,
    filter: "all",
    items: [
      {
        id: "task-1",
        dedupeKey: "confirmation-required:task-1",
        editionId: EDITION_ID,
        showId: null,
        countryId: "00000000-0000-4000-8000-00000000c001",
        assignedTo: null,
        subjectType: "confirmation_requirement",
        subjectId: "task-1",
        sourceKind: "confirmation_requirement",
        sourceKey: "confirmation-required:task-1",
        taskType: "confirmation.required",
        requiredCapability: "confirmation.review",
        sourceState: "open",
        state: "open",
        priority: "high",
        operationalState: "blocked",
        actionRequired: false,
        blocking: true,
        urgency: "high",
        impact: "high",
        deliveryClass: "required",
        title: "Confirmation required",
        description: "A required confirmation is missing.",
        why: "The delegation still owes its canonical confirmation.",
        route: "/admin/confirmations",
        href: "/admin/confirmations",
        primaryAction: {
          kind: "navigate",
          label: "Review blocker",
          route: "/admin/confirmations",
        },
        opensAt: "2026-10-19T18:00:00.000Z",
        deadline: "2026-10-20T18:00:00.000Z",
        dueAt: "2026-10-20T18:00:00.000Z",
        expiresAt: null,
        openedAt: "2026-10-19T18:00:00.000Z",
        resolvedAt: null,
        lastEvaluatedAt: "2026-10-19T20:00:00.000Z",
        stateVersion: "2026-10-19T20:00:00.000Z",
        resolutionPredicate: {},
        resolutionEvidence: {
          sourceState: "open",
          resolvedAt: null,
        },
        ruleReference: [],
      },
    ],
    summary: {
      total: 1,
      unresolved: 1,
      actionable: 0,
      inProgress: 0,
      blocked: 1,
      waiting: 0,
      failed: 0,
      overdue: 0,
      expired: 0,
      superseded: 0,
      resolved: 0,
      blocking: 1,
      needsAction: 0,
    },
    pagination: {
      limit: 200,
      offset: 0,
      total: 1,
      hasMore: false,
      nextOffset: null,
    },
    stateVersion: "projection-v1",
    serverTime: "2026-10-19T20:00:00.000Z",
    ...overrides,
  };
}

describe("Organizer Tasks V3 projection parser", () => {
  it("preserves authoritative operational semantics instead of recomputing them", () => {
    const mapped = mapOrganizerTaskProjectionV3(payload());

    expect(mapped.items[0]?.operationalState).toBe("blocked");
    expect(mapped.items[0]?.blocking).toBe(true);
    expect(mapped.items[0]?.actionRequired).toBe(false);
    expect(mapped.items[0]?.deliveryClass).toBe("required");
    expect(mapped.summary.blocked).toBe(1);
  });

  it("accepts explicit terminal and progress states from the canonical projection", () => {
    const base = payload();
    const task = base.items[0]!;
    const mapped = mapOrganizerTaskProjectionV3({
      ...base,
      items: [
        { ...task, id: "progress", operationalState: "in_progress" },
        { ...task, id: "expired", operationalState: "expired" },
        { ...task, id: "superseded", operationalState: "superseded" },
      ],
      pagination: { ...base.pagination, total: 3 },
    });

    expect(mapped.items.map((item) => item.operationalState)).toEqual([
      "in_progress",
      "expired",
      "superseded",
    ]);
  });

  it("rejects browser command descriptors that are not safe navigation actions", () => {
    const value = payload() as unknown as Record<string, unknown>;
    const items = [...(value.items as Record<string, unknown>[])];
    items[0] = {
      ...items[0],
      primaryAction: {
        kind: "command",
        label: "Resolve",
        command: "mark_resolved",
      },
    };

    expect(() => mapOrganizerTaskProjectionV3({ ...value, items })).toThrow(
      "Organizer Tasks V3 returned an unsupported primary action.",
    );
  });

  it("fails closed on unknown projection schema versions", () => {
    expect(() =>
      mapOrganizerTaskProjectionV3({ ...payload(), schemaVersion: 99 }),
    ).toThrow("Unsupported Organizer Tasks V3 schema version.");
  });
});

describe("Organizer Tasks V3 RPC boundary", () => {
  it("requires exact edition scope before issuing the RPC", async () => {
    const rpc = vi.fn(async () => ({ data: payload(), error: null }));

    await expect(loadOrganizerTasksV3("   ", "all", { rpc })).rejects.toThrow(
      "Organizer Tasks require an explicit selected Organizer edition scope.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the bounded server-side projection and filter", async () => {
    const rpc = vi.fn(async () => ({
      data: { ...payload(), filter: "failed", items: [] },
      error: null,
    }));

    await loadOrganizerTasksV3(`  ${EDITION_ID}  `, "failed", { rpc });

    expect(rpc).toHaveBeenCalledWith("admin_organizer_tasks_v3", {
      p_edition_id: EDITION_ID,
      p_filter: "failed",
      p_limit: 200,
      p_offset: 0,
    });
  });

  it("rejects a projection whose edition scope does not match the request", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ...payload(),
        editionId: "00000000-0000-4000-8000-00000000e221",
      },
      error: null,
    }));

    await expect(loadOrganizerTasksV3(EDITION_ID, "all", { rpc })).rejects.toThrow(
      "Organizer Tasks V3 returned another edition projection.",
    );
  });

  it("rejects a cross-edition task even inside an otherwise matching projection", async () => {
    const base = payload();
    const rpc = vi.fn(async () => ({
      data: {
        ...base,
        items: [
          {
            ...base.items[0],
            editionId: "00000000-0000-4000-8000-00000000e221",
          },
        ],
      },
      error: null,
    }));

    await expect(loadOrganizerTasksV3(EDITION_ID, "all", { rpc })).rejects.toThrow(
      "Organizer Tasks V3 returned a task from another edition scope.",
    );
  });
});
