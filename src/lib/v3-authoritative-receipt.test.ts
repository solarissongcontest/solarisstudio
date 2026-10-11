import { describe, expect, it } from "vitest";

import {
  canUseV3ReceiptForOperation,
  classifyV3ReceiptEvidence,
  createV3AuthoritativeReceipt,
  createV3LegacyServerSuccessEvidence,
  isV3AuthoritativeReceipt,
  matchV3ReceiptIdentity,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

const IDENTITY: V3ReceiptIdentity = {
  idempotencyKey: "confirmation:ssc22:oland:42",
  requestHash: "sha256:request-42",
  actorId: "oland",
  action: "confirmation.submit",
  contextKey: "ssc22:round-1",
};

function receipt() {
  return createV3AuthoritativeReceipt({
    receiptId: "receipt-42",
    workflow: "confirmation",
    identity: IDENTITY,
    entityId: "submission-42",
    serverAcceptedAt: 1_000_000,
    resultHash: "sha256:result-42",
    projectionState: "synced",
  });
}

describe("Solaris Studio V3 authoritative workflow receipts", () => {
  it("creates audit-grade receipt evidence only with server receipt fields", () => {
    const value = receipt();

    expect(value.authority).toBe("authoritative_server");
    expect(value.receiptId).toBe("receipt-42");
    expect(value.serverAcceptedAt).toBe(1_000_000);
    expect(value.resultHash).toBe("sha256:result-42");
    expect(value.identity).toEqual(IDENTITY);
  });

  it("copies operation identity instead of mutating the supplied identity object", () => {
    const input = { ...IDENTITY };
    const value = createV3AuthoritativeReceipt({
      receiptId: "receipt-copy",
      workflow: "jury",
      identity: input,
      entityId: "ballot-1",
      serverAcceptedAt: 2_000_000,
      resultHash: "sha256:ballot-result",
      projectionState: "synced",
    });

    expect(value.identity).not.toBe(input);
    expect(input).toEqual(IDENTITY);
  });

  it("keeps a committed workflow successful even when downstream projection is pending", () => {
    const value = createV3AuthoritativeReceipt({
      receiptId: "receipt-pending",
      workflow: "confirmation",
      identity: IDENTITY,
      entityId: "submission-42",
      serverAcceptedAt: 1_000_000,
      resultHash: "sha256:result-42",
      projectionState: "pending",
    });

    expect(classifyV3ReceiptEvidence(value)).toEqual({
      workflowCommitted: true,
      auditReady: true,
      needsReceiptReconciliation: false,
      projectionPending: true,
    });
  });

  it("treats legacy explicit server success as committed but not audit-ready", () => {
    const legacy = createV3LegacyServerSuccessEvidence({
      workflow: "confirmation",
      entityId: "submission-legacy",
      clientObservedAt: 9_999_999,
      projectionState: "pending",
    });

    expect(isV3AuthoritativeReceipt(legacy)).toBe(false);
    expect(classifyV3ReceiptEvidence(legacy)).toEqual({
      workflowCommitted: true,
      auditReady: false,
      needsReceiptReconciliation: true,
      projectionPending: true,
    });
    expect(canUseV3ReceiptForOperation(legacy, IDENTITY)).toBe(false);
  });

  it("never promotes a client-observed legacy timestamp into server receipt authority", () => {
    const legacy = createV3LegacyServerSuccessEvidence({
      workflow: "confirmation",
      entityId: "submission-legacy",
      clientObservedAt: 123,
      projectionState: "synced",
    });

    expect(legacy.authority).toBe("legacy_server_success");
    expect(legacy.clientObservedAt).toBe(123);
    expect("serverAcceptedAt" in legacy).toBe(false);
    expect("receiptId" in legacy).toBe(false);
    expect("resultHash" in legacy).toBe(false);
  });

  it("accepts a receipt for history only when every operation identity dimension matches", () => {
    const value = receipt();

    expect(matchV3ReceiptIdentity(value, IDENTITY)).toEqual({ matches: true });
    expect(canUseV3ReceiptForOperation(value, IDENTITY)).toBe(true);
  });

  it.each([
    ["idempotency key", { idempotencyKey: "other" }, "idempotency_key_mismatch"],
    ["request hash", { requestHash: "sha256:other" }, "request_hash_mismatch"],
    ["actor", { actorId: "vendia" }, "actor_mismatch"],
    ["action", { action: "jury.submit" }, "action_mismatch"],
    ["context", { contextKey: "ssc22:round-2" }, "context_mismatch"],
  ] as const)("rejects a %s mismatch", (_label, patch, reason) => {
    const value = receipt();
    const expected = { ...IDENTITY, ...patch };

    expect(matchV3ReceiptIdentity(value, expected)).toEqual({
      matches: false,
      reason,
    });
    expect(canUseV3ReceiptForOperation(value, expected)).toBe(false);
  });

  it("rejects incomplete authoritative receipt fields", () => {
    expect(() =>
      createV3AuthoritativeReceipt({
        receiptId: "",
        workflow: "confirmation",
        identity: IDENTITY,
        entityId: "submission-42",
        serverAcceptedAt: 1,
        resultHash: "sha256:result",
        projectionState: "synced",
      }),
    ).toThrow("receiptId must not be empty");

    expect(() =>
      createV3AuthoritativeReceipt({
        receiptId: "receipt-1",
        workflow: "confirmation",
        identity: IDENTITY,
        entityId: "submission-42",
        serverAcceptedAt: -1,
        resultHash: "sha256:result",
        projectionState: "synced",
      }),
    ).toThrow("serverAcceptedAt must be a finite non-negative number");

    expect(() =>
      createV3AuthoritativeReceipt({
        receiptId: "receipt-1",
        workflow: "confirmation",
        identity: IDENTITY,
        entityId: "submission-42",
        serverAcceptedAt: 1,
        resultHash: "",
        projectionState: "synced",
      }),
    ).toThrow("resultHash must not be empty");
  });
});
