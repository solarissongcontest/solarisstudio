import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const form = () => read("src/components/ConfirmationForm.tsx");
const wrapper = () => read("src/components/ConfirmationFormWithReceipt.tsx");
const session = () => read("src/lib/session.ts");

describe("V3 Confirmation uncertain submission recovery", () => {
  it("hands uncertain operations out of the legacy form instead of showing a generic failure", () => {
    const source = form();

    expect(source).toContain("onSubmissionUncertain?: (operationId?: string) => void");
    expect(source).toContain('result.error === "submission_uncertain"');
    expect(source).toContain("onSubmissionUncertain(operationId)");
  });

  it("holds the V3 task away from the submit form while operation status is unknown", () => {
    const source = wrapper();
    const uncertain = source.indexOf("if (uncertainOperationId && uncertainStage)");
    const formRender = source.lastIndexOf("<ConfirmationForm");

    expect(uncertain).toBeGreaterThan(-1);
    expect(formRender).toBeGreaterThan(uncertain);
    expect(source).toContain("Do not submit again. Solaris is checking the exact protected operation");
    expect(source).toContain("Solaris will not tell you the submission failed while its authoritative status cannot be proven.");
  });

  it("reconciles by exact operation and browser session before reopening the form", () => {
    const source = wrapper();

    expect(source).toContain("reconcileAuthoritativeOperation({");
    expect(source).toContain("idempotency_key: operationId");
    expect(source).toContain("browser_session_id: sessionId");
    expect(source).toContain('setUncertainStage("not_committed")');
    expect(source).toContain("The authoritative ledger is reachable and contains no record");
  });

  it("only offers Return to form after the ledger positively reports no commit", () => {
    const source = wrapper();
    const noCommit = source.indexOf('const noCommit = uncertainStage === "not_committed"');
    const returnButton = source.indexOf("Return to form", noCommit);
    const guardedBlock = source.lastIndexOf("{noCommit ? (", returnButton);

    expect(noCommit).toBeGreaterThan(-1);
    expect(guardedBlock).toBeGreaterThan(noCommit);
    expect(returnButton).toBeGreaterThan(guardedBlock);
  });

  it("does not let draft cleanup emit an empty accepted-submission event", () => {
    const source = session();

    expect(source).toContain("receipt?: Omit<SubmissionReceiptDetail");
    expect(source).toContain("if (!receipt) return;");
    expect(source.indexOf("if (!receipt) return;")).toBeLessThan(
      source.indexOf("dispatchSubmissionReceipt(CONFIRMATION_SUBMITTED_EVENT"),
    );
  });

  it("does not restore an old local receipt over an active edit-token flow", () => {
    const source = wrapper();
    const restore = source.indexOf("readStoredV3ConfirmationReceipt(roundId)");
    const editGuard = source.lastIndexOf("if (editing) return;", restore);

    expect(restore).toBeGreaterThan(-1);
    expect(editGuard).toBeGreaterThan(-1);
    expect(editGuard).toBeLessThan(restore);
  });
});
