import { describe, expect, it } from "vitest";

import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";
import { summarizeConfirmationRequirementAttention } from "./v3-organizer-confirmation-requirement-attention";

function requirement(
  id: string,
  status: ConfirmationRequirement["status"],
  countryName: string,
  generation = 1,
): ConfirmationRequirement {
  return {
    revision: "a".repeat(64),
    id,
    editionId: "00000000-0000-4000-8000-00000000e004",
    countryId: `country-${id}`,
    countryName,
    countryCode: countryName.slice(0, 3).toUpperCase(),
    generation,
    status,
    reason: `${countryName} confirmation`,
    validFrom: "2026-10-18T00:00:00.000Z",
    resolvedBySubmissionId: status === "satisfied" ? `submission-${id}` : null,
    resolvedAt: status === "required" ? null : "2026-10-18T01:00:00.000Z",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T01:00:00.000Z",
  };
}

describe("Organizer O4 Confirmation requirement attention", () => {
  it("treats only canonical required obligations as needing attention", () => {
    const summary = summarizeConfirmationRequirementAttention([
      requirement("a", "required", "Vendia"),
      requirement("b", "satisfied", "Oland"),
      requirement("c", "waived", "Hanvør"),
      requirement("d", "invalidated", "Averia"),
    ]);

    expect(summary.needsAttention.map((row) => row.countryName)).toEqual(["Vendia"]);
    expect(summary.totalEffective).toBe(3);
    expect(summary.resolvedEffective).toBe(2);
  });

  it("does not resurrect invalidated/superseded requirements as actionable work", () => {
    const summary = summarizeConfirmationRequirementAttention([
      requirement("old", "invalidated", "Oland", 1),
      requirement("current", "required", "Oland", 2),
    ]);

    expect(summary.needsAttention).toHaveLength(1);
    expect(summary.needsAttention[0]?.generation).toBe(2);
    expect(summary.invalidated).toHaveLength(1);
  });

  it("keeps duplicate effective requirements visible instead of hiding a server invariant defect", () => {
    const summary = summarizeConfirmationRequirementAttention([
      requirement("one", "required", "Oland", 2),
      requirement("two", "required", "Oland", 3),
    ]);

    expect(summary.needsAttention).toHaveLength(2);
    expect(summary.totalEffective).toBe(2);
  });

  it("orders attention deterministically without using entry-review state", () => {
    const summary = summarizeConfirmationRequirementAttention([
      requirement("z", "required", "Vendia", 1),
      requirement("a2", "required", "Averia", 2),
      requirement("a1", "required", "Averia", 1),
    ]);

    expect(summary.needsAttention.map((row) => `${row.countryName}:${row.generation}`)).toEqual([
      "Averia:1",
      "Averia:2",
      "Vendia:1",
    ]);
  });
});
