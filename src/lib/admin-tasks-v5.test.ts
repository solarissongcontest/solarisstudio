import { describe, expect, it, vi } from "vitest";

import {
  loadOrganizerTaskCountV5,
  loadOrganizerTasksV5,
  mapOrganizerTasksV5,
  parseOrganizerTaskCountV5,
} from "./admin-tasks-v5";

function validTask() {
  return {
    id: "task-1",
    editionId: "edition-22",
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
    resolutionPredicate: { kind: "confirmation_reviewed" },
    ruleReference: [" rule-12 ", "rule-12", "rule-14"],
    openedAt: "2026-10-16T10:00:00Z",
    resolvedAt: null,
    lastEvaluatedAt: "2026-10-16T10:01:00Z",
  };
}

describe("Organizer Tasks edition RPC boundary", () => {
  it("fails closed before RPC when Organizer edition scope is missing", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };

    await expect(loadOrganizerTasksV5("", "all", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );
    await expect(loadOrganizerTasksV5("   ", "mine", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
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

  it("fails closed before count RPC when Organizer edition scope is missing", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const client = { rpc };

    await expect(loadOrganizerTaskCountV5("", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts only non-negative integer task counts, including bigint-style numeric strings", () => {
    expect(parseOrganizerTaskCountV5(0)).toBe(0);
    expect(parseOrganizerTaskCountV5(17)).toBe(17);
    expect(parseOrganizerTaskCountV5("42")).toBe(42);
    expect(parseOrganizerTaskCountV5(" 5 ")).toBe(5);
  });

  it("rejects missing or malformed count evidence instead of presenting it as zero", () => {
    for (const value of [null, undefined, "", "nope", -1, 1.5, Number.NaN]) {
      expect(() => parseOrganizerTaskCountV5(value)).toThrow(
        "Invalid Organizer task count payload.",
      );
    }
  });

  it("keeps task evidence object-shaped and normalizes linked rule references", () => {
    const [task] = mapOrganizerTasksV5([validTask()]);
    expect(task?.resolutionPredicate).toEqual({ kind: "confirmation_reviewed" });
    expect(task?.ruleReference).toEqual(["rule-12", "rule-14"]);
  });

  it("rejects arrays and scalar values where a resolution predicate object is required", () => {
    expect(() => mapOrganizerTasksV5([
      { ...validTask(), resolutionPredicate: [] },
    ])).toThrow("Invalid Organizer Task resolution predicate at index 0");
    expect(() => mapOrganizerTasksV5([
      { ...validTask(), resolutionPredicate: "resolved" },
    ])).toThrow("Invalid Organizer Task resolution predicate at index 0");
  });

  it("rejects malformed rule-reference evidence instead of silently dropping it", () => {
    expect(() => mapOrganizerTasksV5([
      { ...validTask(), ruleReference: "rule-12" },
    ])).toThrow("Invalid Organizer Task rule reference at index 0");
    expect(() => mapOrganizerTasksV5([
      { ...validTask(), ruleReference: ["rule-12", ""] },
    ])).toThrow("Invalid Organizer Task rule reference at index 0");
  });
});
