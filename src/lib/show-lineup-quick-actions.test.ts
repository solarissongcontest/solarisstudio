import { describe, expect, it } from "vitest";
import {
  ALLOCATION_GROUPS,
  balancedAllocationDraft,
  fillUnallocatedDraft,
  reorderRunningOrder,
} from "./show-lineup-quick-actions";

describe("Organizer allocation quick actions", () => {
  it.each([1, 2, 3, 16, 17, 18, 19, 50])("balances %i entries across three groups", (count) => {
    const ids = Array.from({ length: count }, (_, index) => `entry-${index}`);
    const draft = balancedAllocationDraft(ids, {}, "all", () => 0.6);
    const counts = ALLOCATION_GROUPS.map((group) =>
      Object.values(draft).filter((value) => value === group).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(Object.keys(draft)).toHaveLength(count);
  });

  it("preserves manually allocated countries when filling remaining groups", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const original = { a: "producer_choice" as const, b: "first_half" as const };
    const filled = balancedAllocationDraft(ids, original, "unassigned", () => 0.25);
    expect(filled.a).toBe("producer_choice");
    expect(filled.b).toBe("first_half");
    expect(Object.values(filled).every(Boolean)).toBe(true);
    expect(original).toEqual({ a: "producer_choice", b: "first_half" });
  });

  it("bulk fills blanks without rewriting existing assignments", () => {
    expect(fillUnallocatedDraft(["a", "b", "c"], { a: "second_half" }, "producer_choice"))
      .toEqual({ a: "second_half", b: "producer_choice", c: "producer_choice" });
  });

  it("moves a running-order entry without dropping or duplicating countries", () => {
    const previous = ["a", "b", "c", "d"];
    const moved = reorderRunningOrder(previous, "d", "b");
    expect(moved).toEqual(["a", "d", "b", "c"]);
    expect(previous).toEqual(["a", "b", "c", "d"]);
    expect(reorderRunningOrder(previous, "missing", "b")).toBe(previous);
    expect(reorderRunningOrder(previous, "b", "b")).toBe(previous);
  });
});
