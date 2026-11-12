export type RequirementCommandExpectation = {
  kind: "waive" | "reconfirm";
  operationId: string;
  requirementId: string;
  previousGeneration: number;
};
const uncertain =
  "Confirmation command acknowledgement does not match the reviewed operation. Outcome is uncertain; reload authoritative requirements before retrying.";

/** An invalid JSONB acknowledgement is not proof the server did not commit. */
export function assertConfirmationRequirementCommandReceipt(
  receipt: unknown,
  expected: RequirementCommandExpectation,
): void {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
      !expected.operationId || !expected.requirementId ||
      !Number.isSafeInteger(expected.previousGeneration) || expected.previousGeneration < 1) {
    throw new Error(uncertain);
  }
  const row = receipt as Record<string, unknown>;
  if (row.ok !== true || row.operationId !== expected.operationId ||
      typeof row.requirementId !== "string" || !row.requirementId.trim()) {
    throw new Error(uncertain);
  }
  if (expected.kind === "waive") {
    if (row.requirementId !== expected.requirementId || row.status !== "waived") throw new Error(uncertain);
    return;
  }
  if (expected.kind !== "reconfirm" || row.previousRequirementId !== expected.requirementId ||
      row.requirementId === expected.requirementId || typeof row.generation !== "number" ||
      !Number.isSafeInteger(row.generation) || row.generation !== expected.previousGeneration + 1) {
    throw new Error(uncertain);
  }
}
