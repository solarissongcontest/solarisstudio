import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isCurrentConfirmationRequirementAction } from "./confirmation-requirement-action-scope";

describe("Organizer Confirmation requirement review completion", () => {
  it("allows completion UI only for the requested edition and review epoch", () => {
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", 1, 1)).toBe(true);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-b", 1, 1)).toBe(false);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", 1, 2)).toBe(false);
  });

  it("rejects late A -> B -> A completions, even with the same edition identity", () => {
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", 3, 5)).toBe(false);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", 5, 5)).toBe(true);
  });

  it("fails closed on empty edition and invalid review epochs", () => {
    expect(isCurrentConfirmationRequirementAction("", "", 2, 2)).toBe(false);
    expect(isCurrentConfirmationRequirementAction(null, null, 2, 2)).toBe(false);
    expect(isCurrentConfirmationRequirementAction(undefined, "edition-a", 2, 2)).toBe(false);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", NaN, NaN)).toBe(false);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", -1, -1)).toBe(false);
    expect(isCurrentConfirmationRequirementAction("edition-a", "edition-a", 1.5, 1.5)).toBe(false);
  });

  it("does not clear a newer pending review for a prior selection epoch", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("useLayoutEffect(() => {");
    expect(source).toContain("activeEditionRef.current = editionId;");
    expect(source).toContain("editionReviewEpochRef.current += 1;");
    expect(source).toContain("variables.reviewEpoch, editionReviewEpochRef.current");
    expect(source).toContain("reviewEpoch: editionReviewEpochRef.current,");
    expect(source).toContain('queryKey: ["confirmation-requirements", variables.organizerEditionId]');
    expect(source).toContain("action.variables?.reviewEpoch === editionReviewEpochRef.current");
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

  it("keeps ensure idempotent from the UI and its success/error bound to the originating epoch", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("const ensureInFlightRef = useRef(false);");
    expect(source).toContain("if (!editionId || ensureInFlightRef.current || ensure.isPending ||");
    expect(source).toContain("ensureInFlightRef.current = true;");
    expect(source).toContain("ensureInFlightRef.current = false;");
    expect(source).toContain("ensure.mutate({ editionId, reviewEpoch: editionReviewEpochRef.current });");
    expect(source).toContain("mutationFn: (input: { editionId: string; reviewEpoch: number })");
    expect(source).toContain('queryKey: ["confirmation-requirements", input.editionId]');
    expect(source).toContain("Requirements for a prior Organizer edition selection could not be verified.");
  });

  it("does not show late failures from a previous review epoch", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("action.error && action.variables?.organizerEditionId === editionId");
    expect(source).toContain("action.variables?.reviewEpoch === editionReviewEpochRef.current");
    expect(source).toContain("The previous edition's requirement operation completed.");
  });

  it("keeps a visible recovery route after edition switching closes the R2 review sheet", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    expect(source).toContain("type UnresolvedRequirementOperation = {");
    expect(source).toContain("editionId: input.organizerEditionId,");
    expect(source).toContain("countryName: input.requirement.countryName,");
    expect(source).toContain("const [unresolvedRequirement, setUnresolvedRequirement]");
    expect(source).toContain("unresolvedRequirementRef.current = next;");
    expect(source).toContain("setUnresolvedRequirement(next);");
    expect(source).toContain('title="Requirement operation awaiting reconciliation"').toBe(false);
    expect(source).toContain("Requirement operation awaiting reconciliation");
    expect(source).toContain("Select the original Organizer edition to reconcile this operation.");
    expect(source).toContain("onClick={() => void reconcileOutstandingRequirement()}");
    expect(source).toContain("unresolvedRequirement.editionId !== editionId");
    expect(source).toContain("setPending(null);");
  });

  it("requires exact original operation identity and authoritative settlement before unlocking R2", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    const start = source.indexOf("  async function reconcileOutstandingRequirement()");
    const end = source.indexOf("  return (", start);
    const recovery = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(recovery).toContain("if (!outstanding || reconciliationInFlightRef.current || actionInFlightRef.current");
    expect(recovery).toContain("outstanding.editionId !== editionId");
    expect(recovery).toContain("reconciliationInFlightRef.current = true;");
    expect(recovery).toContain("data: { operationId: outstanding.operationId }");
    expect(recovery).toContain("result.receipt.operationId !== outstanding.operationId");
    expect(recovery).toContain('result.receipt.status !== "succeeded" && result.receipt.status !== "failed"');
    const authoritative = recovery.indexOf('result.receipt.status !== "succeeded" && result.receipt.status !== "failed"');
    const release = recovery.indexOf("updateUnresolvedRequirement(null);");
    expect(release).toBeGreaterThan(authoritative);
    expect(recovery).toContain("reconciliationInFlightRef.current = false;");
  });

  it("settles the operation before refetch and does not mislabel failed refresh as a failed mutation", () => {
    const source = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
    const start = source.indexOf("  async function reconcileOutstandingRequirement()");
    const end = source.indexOf("  return (", start);
    const recovery = source.slice(start, end);
    expect(recovery.indexOf("updateUnresolvedRequirement(null);")).toBeLessThan(recovery.indexOf("Promise.allSettled(["));
    expect(recovery).toContain("The operation was settled, but the current edition projection did not refresh.");
    expect(source).toContain("unresolvedRequirementRef.current || editionId !== activeEditionRef.current");
    expect(source).toContain("ensure.isPending || ensureInFlightRef.current || Boolean(unresolvedRequirement)");
  });
});
