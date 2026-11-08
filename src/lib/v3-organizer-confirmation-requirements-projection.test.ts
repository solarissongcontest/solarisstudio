import { describe, expect, it } from "vitest";

import type { ConfirmationRequirement } from "@/integrations/confirmations/admin";
import { validateConfirmationRequirementsProjection } from "@/integrations/confirmations/confirmation-requirements-projection";

const editionId = "00000000-0000-4000-8000-00000000e004";

function requirement(override: Partial<ConfirmationRequirement> = {}): ConfirmationRequirement {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    editionId,
    countryId: "00000000-0000-4000-8000-00000000c001",
    countryName: "Oland",
    countryCode: "OLA",
    generation: 1,
    status: "required",
    reason: "Confirmation required",
    validFrom: "2026-11-07T12:00:00Z",
    resolvedBySubmissionId: null,
    resolvedAt: null,
    createdAt: "2026-11-07T12:00:00Z",
    updatedAt: "2026-11-07T12:00:00Z",
    ...override,
  };
}

describe("exact-edition Organizer Confirmation obligation projection", () => {
  it("preserves a genuinely empty backend array without fabricating obligations", () => {
    expect(validateConfirmationRequirementsProjection([], editionId)).toEqual([]);
  });

  it("retains valid requirements, including invalidated rows used for diagnostics", () => {
    const rows = [
      requirement(),
      requirement({ id: "00000000-0000-4000-8000-000000000002", status: "invalidated", generation: 2 }),
    ];
    expect(validateConfirmationRequirementsProjection(rows, editionId)).toEqual(rows);
  });

  it("does not conceal duplicate countries, so the dashboard may surface an invariant defect", () => {
    const rows = [
      requirement(),
      requirement({ id: "00000000-0000-4000-8000-000000000002", status: "required", generation: 2 }),
    ];
    expect(validateConfirmationRequirementsProjection(rows, editionId)).toHaveLength(2);
  });

  it.each([null, undefined, false, {}, "", "[]", { error: "denied" }])(
    "rejects a malformed root instead of turning %j into zero obligations",
    (value) => {
      expect(() => validateConfirmationRequirementsProjection(value, editionId)).toThrow(/invalid projection/);
    },
  );

  it("requires explicit edition context", () => {
    expect(() => validateConfirmationRequirementsProjection([], "")).toThrow(/explicit Organizer edition/);
  });

  it("rejects wrong-edition rows even when the RPC itself succeeded", () => {
    expect(() => validateConfirmationRequirementsProjection([
      requirement({ editionId: "different-edition" }),
    ], editionId)).toThrow(/cross-edition truth/);
  });

  it.each([
    { id: "" }, { countryId: "" }, { countryName: "" },
    { status: "unrecognized" }, { generation: 0 },
    { generation: 1.5 }, { reason: null },
  ])("rejects invalid required fields (%j)", (delta) => {
    expect(() => validateConfirmationRequirementsProjection([{
      ...requirement(), ...delta,
    }], editionId)).toThrow(/invalid or cross-edition truth/);
  });

  it("rejects null or scalar rows and duplicate requirement IDs", () => {
    expect(() => validateConfirmationRequirementsProjection([null], editionId)).toThrow(/invalid row/);
    expect(() => validateConfirmationRequirementsProjection([42], editionId)).toThrow(/invalid row/);
    expect(() => validateConfirmationRequirementsProjection([requirement(), requirement()], editionId)).toThrow(/duplicate requirement IDs/);
  });
});
