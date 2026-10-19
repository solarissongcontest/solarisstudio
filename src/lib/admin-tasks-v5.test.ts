import { describe, expect, it, vi } from "vitest";

import {
  loadOrganizerTaskCountV5,
  loadOrganizerTasksV5,
  mapOrganizerTasksV5,
  resolveOrganizerTaskOperationalState,
  type OrganizerTaskV5,
} from "./admin-tasks-v5";

function task(overrides: Partial<OrganizerTaskV5> = {}): OrganizerTaskV5 {
  return {
    id: "task-1",
    editionId: "00000000-0000-4000-8000-00000000e220",
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

describe("Organizer Tasks edition RPC boundary", () => {
  it("refuses missing or whitespace-only edition scope before any task RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };

    await expect(loadOrganizerTasksV5("", "all", client)).rejects.toThrow(
      "Organizer Tasks require an explicit selected Organizer edition scope.",
    );
    await expect(loadOrganizerTasksV5("   ", "mine", client)).rejects.toThrow(
      "Organizer Tasks require an explicit selected Organizer edition scope.",
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves a selected UUID while trimming accidental surrounding whitespace", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };
    const editionId = "00000000-0000-4000-8000-00000000e220";

    await loadOrganizerTasksV5(`  ${editionId}  `, "waiting", client);

    expect(rpc).toHaveBeenCalledWith("admin_organizer_tasks", {
      p_edition_id: editionId,
      p_filter: "waiting",
    });
  });

  it("refuses missing edition scope before the task-count RPC", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const client = { rpc };

    await expect(loadOrganizerTaskCountV5("", client)).rejects.toThrow(
      "Organizer Tasks require an explicit selected Organizer edition scope.",
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a cross-edition task row even after an exact-edition RPC", async () => {
    const editionId = "00000000-0000-4000-8000-00000000e220";
    const rpc = vi.fn(async () => ({
      data: [
        task({
          editionId: "00000000-0000-4000-8000-00000000e221",
        }),
      ],
      error: null,
    }));

    await expect(loadOrganizerTasksV5(editionId, "all", { rpc })).rejects.toThrow(
      "Organizer Tasks returned a task from another edition scope.",
    );
  });

  it("allows edition-null system tasks returned by an exact-edition projection", async () => {
    const editionId = "00000000-0000-4000-8000-00000000e220";
    const rpc = vi.fn(async () => ({ data: [task({ editionId: null })], error: null }));

    await expect(loadOrganizerTasksV5(editionId, "all", { rpc })).resolves.toHaveLength(1);
  });
});

describe("Organizer Task operational state trust boundary", () => {
  it("accepts an explicit canonical operational state when the payload provides one", () => {
    const [mapped] = mapOrganizerTasksV5([
      {
        ...task(),
        operationalState: "blocked",
      },
    ]);

    expect(mapped.operationalState).toBe("blocked");
  });

  it("rejects unknown operational states instead of silently inventing UI semantics", () => {
    expect(() =>
      mapOrganizerTasksV5([
        {
          ...task(),
          operationalState: "sort-of-bad",
        },
      ]),
    ).toThrow("Invalid Organizer Task operational state at index 0");
  });

  it("keeps resolved and waiting domain state authoritative", () => {
    expect(
      resolveOrganizerTaskOperationalState(
        task({ state: "resolved", operationalState: "failed" }),
      ),
    ).toBe("resolved");
    expect(
      resolveOrganizerTaskOperationalState(
        task({ state: "waiting", operationalState: "blocked" }),
      ),
    ).toBe("waiting");
  });

  it("honors explicit blocked and failed evidence for open tasks", () => {
    expect(
      resolveOrganizerTaskOperationalState(task({ operationalState: "blocked" })),
    ).toBe("blocked");
    expect(
      resolveOrganizerTaskOperationalState(task({ operationalState: "failed" })),
    ).toBe("failed");
  });

  it("derives overdue only from an actual due timestamp", () => {
    const now = Date.parse("2026-10-18T00:00:00.000Z");

    expect(
      resolveOrganizerTaskOperationalState(
        task({ dueAt: "2026-10-17T23:59:59.000Z" }),
        now,
      ),
    ).toBe("overdue");
    expect(
      resolveOrganizerTaskOperationalState(
        task({ dueAt: "2026-10-18T00:00:01.000Z" }),
        now,
      ),
    ).toBe("actionable");
    expect(
      resolveOrganizerTaskOperationalState(task({ dueAt: "not-a-date" }), now),
    ).toBe("actionable");
  });

  it("never treats severity as workflow state", () => {
    const now = Date.parse("2026-10-18T00:00:00.000Z");

    expect(
      resolveOrganizerTaskOperationalState(
        task({ priority: "critical", dueAt: "2026-10-19T00:00:00.000Z" }),
        now,
      ),
    ).toBe("actionable");
  });
});
