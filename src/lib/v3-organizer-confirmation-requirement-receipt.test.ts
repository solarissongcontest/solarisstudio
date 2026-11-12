import { describe, expect, it } from "vitest";
import { assertConfirmationRequirementCommandReceipt, type RequirementCommandExpectation } from "@/lib/v3-organizer-confirmation-requirement-receipt";

const waivedExpectation: RequirementCommandExpectation = {
  kind: "waive", operationId: "operation-a", requirementId: "requirement-a", previousGeneration: 2,
};
const renewedExpectation: RequirementCommandExpectation = { ...waivedExpectation, kind: "reconfirm" };
const waived = { ok: true, operationId: "operation-a", requirementId: "requirement-a", status: "waived" };
const renewed = { ok: true, operationId: "operation-a", previousRequirementId: "requirement-a", requirementId: "requirement-b", generation: 3 };

describe("Organizer R2 Confirmation requirement receipt contract", () => {
  it("accepts exact canonical waiver and reconfirm receipts", () => {
    expect(() => assertConfirmationRequirementCommandReceipt(waived, waivedExpectation)).not.toThrow();
    expect(() => assertConfirmationRequirementCommandReceipt(renewed, renewedExpectation)).not.toThrow();
  });
  it.each([null, undefined, [], {}, { ok: false }, "success"])("refuses malformed receipt %j", value => {
    expect(() => assertConfirmationRequirementCommandReceipt(value, waivedExpectation)).toThrow(/acknowledgement does not match/);
  });
  it.each([{ operationId: "different" }, { requirementId: "unrelated" }, { status: "required" }, { ok: false }])("refuses wrong waiver receipt %j", changes => {
    expect(() => assertConfirmationRequirementCommandReceipt({ ...waived, ...changes }, waivedExpectation)).toThrow(/acknowledgement does not match/);
  });
  it.each([{ operationId: "different" }, { previousRequirementId: "other" }, { requirementId: "requirement-a" }, { generation: 2 }, { generation: 4 }, { generation: null }, { ok: false }])("refuses wrong reconfirm receipt %j", changes => {
    expect(() => assertConfirmationRequirementCommandReceipt({ ...renewed, ...changes }, renewedExpectation)).toThrow(/acknowledgement does not match/);
  });
  it("rejects invalid previous requirement generation", () => {
    expect(() => assertConfirmationRequirementCommandReceipt(waived, { ...waivedExpectation, previousGeneration: 0 })).toThrow(/acknowledgement does not match/);
  });
});
