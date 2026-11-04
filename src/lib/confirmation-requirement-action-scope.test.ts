import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isCurrentConfirmationRequirementAction } from "./confirmation-requirement-action-scope";

describe("Organizer Confirmation requirement review completion", () => {
  it("allows completion UI only for the currently selected edition", () => {
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a")).toBe(true);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-b")).toBe(false);
  });

  it("fails closed for a missing edition, including two empty values", () => {
    expect(isCurrentConfirmationRequirementAction("", "")).toBe(false);
    expect(isCurrentConfirmationRequirementAction(null, null)).toBe(false);
    expect(isCurrentConfirmationRequirementAction(undefined, "edition-a")).toBe(false);
  });

  it("never clears a new edition's pending review for an old completion", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("useLayoutEffect(() => {");
    expect(source).toContain("activeEditionRef.current = editionId;");
    expect(source).toContain(
      "isCurrentConfirmationRequirementAction(variables.organizerEditionId, activeEditionRef.current)",
    );
    expect(source).toContain("if (isCurrentConfirmationRequirementAction(variables.organizerEditionId");
    expect(source).toContain("queryKey: [\"confirmation-requirements\", variables.organizerEditionId]");
  });

  it("uses a synchronous single-flight lock before creating an operation", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("if (actionInFlightRef.current || action.isPending");
    expect(source).toContain("actionInFlightRef.current = true;");
    expect(source).toContain("actionInFlightRef.current = false;");
    expect(source).toContain("disabled={action.isPending || actionInFlightRef.current");
    expect(source).toContain("operationId: command.operationId");
    expect(source).toContain("idempotencyKey: command.idempotencyKey");
  });

  it("does not show an old edition's errors on the newly selected edition", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain(
      "action.error && action.variables?.organizerEditionId === editionId",
    );
    expect(source).toContain("The previous edition's requirement operation completed.");
  });
});
