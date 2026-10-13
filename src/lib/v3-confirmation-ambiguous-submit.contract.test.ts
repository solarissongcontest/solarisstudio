import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/public.functions.ts"), "utf8");

describe("V3 Confirmation ambiguous submit compatibility boundary", () => {
  it("derives one operation identity before dispatch and reuses it for reconciliation", () => {
    const text = source();
    const derive = text.indexOf("protectedOperationId = await deriveConfirmationIdempotencyKey");
    const submit = text.indexOf('"v3_submit_confirmation"');
    const reconcile = text.indexOf('"v3_reconcile_confirmation"');

    expect(derive).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(derive);
    expect(reconcile).toBeGreaterThan(submit);
    expect(text).toContain("_idempotency_key: protectedOperationId");
    expect(text).toContain("_browser_session_id: data.browser_session_id");
  });

  it("does not classify an unknown submit transport error before checking the receipt ledger", () => {
    const text = source();
    const submitCatch = text.indexOf("} catch (submitError) {");
    const reconcile = text.indexOf('"v3_reconcile_confirmation"', submitCatch);
    const uncertain = text.indexOf('error: "submission_uncertain"', reconcile);

    expect(submitCatch).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(submitCatch);
    expect(uncertain).toBeGreaterThan(reconcile);
  });

  it("treats a reachable ledger with no operation as proof the atomic mutation did not commit", () => {
    const text = source();

    expect(text).toContain("if (reconciled.found === true)");
    expect(text).toContain("throw submitError;");
    expect(text).toContain("Atomic submit + receipt means a reachable ledger with no row");
  });

  it("keeps the operation epoch unchanged when both submit and reconciliation status are uncertain", () => {
    const text = source();
    const uncertain = text.indexOf('error: "submission_uncertain"');
    const rotate = text.indexOf("rotateConfirmationOperationEpoch();", uncertain);

    expect(uncertain).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(uncertain);
    expect(text.slice(uncertain, rotate)).toContain("operation_id: protectedOperationId");
  });

  it("rotates only after an acknowledged submit or successful reconciliation", () => {
    const text = source();
    const reconcileFound = text.indexOf("if (reconciled.found === true)");
    const rotate = text.indexOf("rotateConfirmationOperationEpoch();", reconcileFound);

    expect(reconcileFound).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(reconcileFound);
    expect(text.slice(reconcileFound, rotate)).toContain("result = reconciled");
  });
});
