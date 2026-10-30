import { describe, expect, it, vi } from "vitest";

import {
  hasCompleteOrganizerTaskOperationalEvidence,
  loadOrganizerTaskCountV5,
  loadOrganizerTasksV5,
  mapOrganizerTasksV3Compatibility,
  mapOrganizerTasksV5,
  resolveOrganizerTaskOperationalState,
  type OrganizerTaskV5,
} from "./admin-tasks-v5";

const EDITION_ID = "00000000-0000-4000-8000-00000000e220";

function task(overrides: Partial<OrganizerTaskV5> = {}): OrganizerTaskV5 {
  return {
    id: "task-1",
    editionId: EDITION_ID,
    countryId: null,
    assignedTo: null,
    sourceKind: "confirmation_requirement",
    sourceKey: "confirmation_requirement:task-1",
    taskType: "confirmation.requirement",
    priority: "normal",
    state: "open",
    operationalState: null,
    title: "Review requirement",
    description: "Review the canonical requirement state.",
    href: "/admin/tasks",
    dueAt: null,
    resolutionPredicate: {},
    ruleReference: [],
    openedAt: "2026-10-17T10:00:00.000Z",
    resolvedAt: null,
    lastEvaluatedAt: "2026-10-17T10:00:00.000Z",
    ...overrides,
  };
}

function v3Task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    dedupeKey: "confirmation_requirement:task-1",
    editionId: EDITION_ID,
    showId: null,
    countryId: null,
    subjectType: "confirmation_requirement",
    subjectId: "task-1",
    sourceKind: "confirmation_requirement",
    sourceKey: "confirmation_requirement:task-1",
    taskType: "confirmation.requirement",
    requiredCapability: "confirmation.manage",
    sourceState: "open",
    operationalState: "actionable",
    actionRequired: true,
    blocking: false,
    urgency: "low",
    impact: "medium",
    deliveryClass: "recommended",
    priority: "normal",
    title: "Review requirement",
    description: "Review the canonical requirement state.",
    why: "Canonical condition remains unresolved.",
    route: "/admin/tasks",
    href: "/admin/tasks",
    primaryAction: { kind: "navigate", label: "Review", route: "/admin/tasks" },
    assignedTo: null,
    opensAt: "2026-10-17T10:00:00.000Z",
    deadline: null,
    dueAt: null,
    expiresAt: null,
    openedAt: "2026-10-17T10:00:00.000Z",
    resolvedAt: null,
    lastEvaluatedAt: "2026-10-17T10:00:00.000Z",
    stateVersion: "2026-10-17T10:00:00.000Z",
    resolutionPredicate: {},
    ruleReference: [],
    resolutionEvidence: {},
    ...overrides,
  };
}

function v3Projection(items: unknown[] = [v3Task()]) {
  return {
    schemaVersion: 1,
    editionId: EDITION_ID,
    filter: "all",
    items,
    summary: {},
    pagination: { limit: 200, offset: 0, total: items.length, hasMore: false, nextOffset: null },
    stateVersion: "state-1",
    serverTime: "2026-10-17T10:00:00.000Z",
    authoritativeSource: "studio2_organizer_tasks",
    reconciled: true,
  };
}

describe("Organizer Tasks canonical V3 RPC boundary", () => {
  it("refuses missing edition scope before any task RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await expect(loadOrganizerTasksV5("", "all", { rpc })).rejects.toThrow(
      "Organizer Tasks require an explicit selected Organizer edition scope.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the canonical V3 projection first and preserves exact edition scope", async () => {
    const rpc = vi.fn(async () => ({ data: v3Projection(), error: null }));
    const result = await loadOrganizerTasksV5(`  ${EDITION_ID}  `, "waiting", { rpc });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_organizer_tasks_v3", {
      p_edition_id: EDITION_ID,
      p_filter: "waiting",
      p_limit: 200,
      p_offset: 0,
    });
    expect(result[0]?.operationalState).toBe("actionable");
  });

  it("collapses richer V3 terminal/progress states only for legacy route compatibility", () => {
    const mapped = mapOrganizerTasksV3Compatibility(
      v3Projection([
        v3Task({ id: "progress", sourceKey: "progress", operationalState: "in_progress" }),
        v3Task({ id: "expired", sourceKey: "expired", operationalState: "expired" }),
        v3Task({
          id: "superseded",
          sourceKey: "superseded",
          sourceState: "resolved",
          operationalState: "superseded",
        }),
      ]),
      EDITION_ID,
    );

    expect(mapped.map((item) => item.operationalState)).toEqual([
      "actionable",
      "overdue",
      "resolved",
    ]);
  });

  it("rejects V3 payloads that do not prove canonical reconciliation", () => {
    expect(() =>
      mapOrganizerTasksV3Compatibility(
        { ...v3Projection(), reconciled: false },
        EDITION_ID,
      ),
    ).toThrow("Organizer Tasks V3 did not prove canonical reconciliation.");
  });

  it("rejects cross-edition rows after the exact-edition V3 read", async () => {
    const rpc = vi.fn(async () => ({
      data: v3Projection([
        v3Task({ editionId: "00000000-0000-4000-8000-00000000e221" }),
      ]),
      error: null,
    }));

    await expect(loadOrganizerTasksV5(EDITION_ID, "all", { rpc })).rejects.toThrow(
      "Organizer Tasks returned a task from another edition scope.",
    );
  });

  it("fails closed on a real V3 error rather than falling back to weaker semantics", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "Organizer task access required" },
    }));

    await expect(loadOrganizerTasksV5(EDITION_ID, "all", { rpc })).rejects.toThrow(
      "Organizer task access required",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uses the legacy canonical task-table read only during deployment-order RPC absence", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "admin_organizer_tasks_v3") {
        return {
          data: null,
          error: { code: "PGRST202", message: "Could not find admin_organizer_tasks_v3" },
        };
      }
      return { data: [task({ operationalState: "blocked" })], error: null };
    });

    const result = await loadOrganizerTasksV5(EDITION_ID, "all", { rpc });
    expect(result[0]?.operationalState).toBe("blocked");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("prefers the canonical V3 count and only falls back when that RPC is absent", async () => {
    const canonicalRpc = vi.fn(async () => ({ data: 7, error: null }));
    await expect(loadOrganizerTaskCountV5(EDITION_ID, { rpc: canonicalRpc })).resolves.toBe(7);
    expect(canonicalRpc).toHaveBeenCalledWith("admin_organizer_task_count_v3", {
      p_edition_id: EDITION_ID,
    });

    const fallbackRpc = vi.fn(async (name: string) => {
      if (name === "admin_organizer_task_count_v3") {
        return { data: null, error: { code: "PGRST202", message: "missing" } };
      }
      return { data: 3, error: null };
    });
    await expect(loadOrganizerTaskCountV5(EDITION_ID, { rpc: fallbackRpc })).resolves.toBe(3);
  });

  it.each([null, "0", -1, 1.5, Number.NaN])(
    "rejects malformed canonical task-count payload %p",
    async (data) => {
      const rpc = vi.fn(async () => ({ data, error: null }));
      await expect(loadOrganizerTaskCountV5(EDITION_ID, { rpc })).rejects.toThrow(
        "Organizer task count returned an invalid authoritative payload.",
      );
    },
  );
});

describe("Organizer Task operational state trust boundary", () => {
  it("accepts explicit canonical operational state", () => {
    const [mapped] = mapOrganizerTasksV5([{ ...task(), operationalState: "blocked" }]);
    expect(mapped.operationalState).toBe("blocked");
  });

  it("rejects unknown operational states", () => {
    expect(() =>
      mapOrganizerTasksV5([{ ...task(), operationalState: "sort-of-bad" }]),
    ).toThrow("Invalid Organizer Task operational state at index 0");
  });

  it("keeps resolved and waiting source state authoritative", () => {
    expect(
      resolveOrganizerTaskOperationalState(task({ state: "resolved", operationalState: "failed" })),
    ).toBe("resolved");
    expect(
      resolveOrganizerTaskOperationalState(task({ state: "waiting", operationalState: "blocked" })),
    ).toBe("waiting");
  });

  it("never promotes due time or severity into workflow truth in the browser", () => {
    expect(
      resolveOrganizerTaskOperationalState(
        task({ dueAt: "2020-01-01T00:00:00Z", priority: "critical", operationalState: null }),
      ),
    ).toBe("unclassified");
  });

  it("requires canonical rich-state evidence for every unresolved open task", () => {
    expect(
      hasCompleteOrganizerTaskOperationalEvidence([
        task({ state: "waiting", operationalState: null }),
        task({ state: "resolved", operationalState: null }),
        task({ state: "open", operationalState: "blocked" }),
      ]),
    ).toBe(true);

    expect(
      hasCompleteOrganizerTaskOperationalEvidence([
        task({ id: "modern", operationalState: "failed" }),
        task({ id: "legacy", operationalState: null }),
      ]),
    ).toBe(false);
  });
});
