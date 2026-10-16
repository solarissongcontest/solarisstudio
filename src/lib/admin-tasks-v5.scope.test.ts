import { describe, expect, it } from "vitest";

import { loadOrganizerTasksV5 } from "./admin-tasks-v5";

function task(editionId: string | null) {
  return {
    id: "task-1",
    editionId,
    countryId: null,
    assignedTo: null,
    sourceKind: "confirmation",
    sourceKey: "confirmation:country-1",
    taskType: "confirmation.review",
    priority: "high",
    state: "open",
    title: "Review confirmation",
    description: "A confirmation needs review.",
    href: "/confirmations/admin/responses/submission-1",
    dueAt: null,
    resolutionPredicate: {},
    ruleReference: [],
    openedAt: "2026-10-16T10:00:00Z",
    resolvedAt: null,
    lastEvaluatedAt: "2026-10-16T10:01:00Z",
  };
}

describe("Organizer Tasks exact-edition client boundary", () => {
  it("sends the selected edition to the authoritative Tasks RPC", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const client = {
      rpc: async (_name: string, args?: Record<string, unknown>) => {
        capturedArgs = args;
        return { data: [task("edition-1")], error: null };
      },
    };

    const tasks = await loadOrganizerTasksV5(" edition-1 ", "all", client);

    expect(capturedArgs).toEqual({ p_edition_id: "edition-1", p_filter: "all" });
    expect(tasks).toHaveLength(1);
  });

  it("rejects any non-null task that belongs to a different edition", async () => {
    const client = {
      rpc: async () => ({ data: [task("edition-2")], error: null }),
    };

    await expect(loadOrganizerTasksV5("edition-1", "all", client)).rejects.toThrow(
      "Organizer Tasks returned data outside the selected edition scope.",
    );
  });

  it("allows explicitly global task evidence without changing the selected edition", async () => {
    const client = {
      rpc: async () => ({ data: [task(null)], error: null }),
    };

    const tasks = await loadOrganizerTasksV5("edition-1", "all", client);
    expect(tasks[0]?.editionId).toBeNull();
  });

  it("fails before calling the backend when Organizer edition scope is missing", async () => {
    let called = false;
    const client = {
      rpc: async () => {
        called = true;
        return { data: [], error: null };
      },
    };

    await expect(loadOrganizerTasksV5("  ", "all", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );
    expect(called).toBe(false);
  });
});
