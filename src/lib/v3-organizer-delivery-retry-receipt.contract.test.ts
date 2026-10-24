import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = () =>
  readFileSync(
    resolve(process.cwd(), "src/routes/_authenticated/admin/system-operations.tsx"),
    "utf8",
  );

const retryModel = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-organizer-delivery-retry.ts"), "utf8");

describe("Organizer Delivery & Jobs authoritative retry acknowledgement", () => {
  it("persists only an already-validated succeeded outcome as the visible acknowledgement", () => {
    const source = route();

    expect(source).toContain("type DeliveryRetrySuccess");
    expect(source).toContain("useState<DeliveryRetrySuccess | null>(null)");
    expect(source).toContain('if (outcome.state === "succeeded")');
    expect(source).toContain("setRetryReceipt(outcome)");
    expect(source).toContain("Authoritative result");
    expect(source).toContain("retryReceipt.operationId");
    expect(source).toContain("retryReceipt.deliveryId");
  });

  it("distinguishes direct acknowledgement from success proved by operation reconciliation", () => {
    const source = route();

    expect(source).toContain("retryReceipt.reconciled");
    expect(source).toContain("Retry confirmed by reconciliation");
    expect(source).toContain("confirmed from operation receipt");
    expect(source).toContain("confirmed directly by server");
  });

  it("clears stale acknowledgement before another mutation for the same delivery", () => {
    const source = route();

    const clearIndex = source.indexOf(
      "setRetryReceipt((current) =>\n      current?.deliveryId === deliveryId ? null : current,",
    );
    const mutateIndex = source.indexOf("retry.mutate({ deliveryId, ...identity });");

    expect(clearIndex).toBeGreaterThan(-1);
    expect(mutateIndex).toBeGreaterThan(clearIndex);
  });

  it("inherits #1582's fail-closed direct and ledger-reconciled success validation", () => {
    const source = retryModel();

    expect(source).toContain("isSettledRetryResult");
    expect(source).toContain('row.status === "pending"');
    expect(source).toContain("studio2_reconcile_operation");
    expect(source).toContain("receipt.command !== DELIVERY_RETRY_COMMAND");
    expect(source).toContain('state: "succeeded"');
    expect(source).toContain("reconciled: true");
    expect(source).toContain("reconciled: false");
  });
});
