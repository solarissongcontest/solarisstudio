import { describe, expect, it } from "vitest";

import {
  adaptV3JuryRpcOutcome,
} from "./v3-jury-migration-adapter";
import {
  classifyV3ReceiptEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

const IDENTITY: V3ReceiptIdentity = {
  idempotencyKey: "jury:ssc22:sf1:oland:ballot-42",
  requestHash: "sha256:jury-request-42",
  actorId: "oland",
  action: "jury.submit",
  contextKey: "ssc22:sf1",
};

describe("Solaris Studio V3 Jury migration adapter", () => {
  it("bridges the current successful RPC UUID as committed legacy evidence", () => {
    const outcome = adaptV3JuryRpcOutcome({
      outcome: { kind: "rpc_success", ballotId: "ballot-42" },
      clientObservedAt: 5_000,
    });

    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.ballotId).toBe("ballot-42");
    expect(outcome.evidence.authority).toBe("legacy_server_success");
    expect(classifyV3ReceiptEvidence(outcome.evidence)).toEqual({
      workflowCommitted: true,
      auditReady: false,
      needsReceiptReconciliation: true,
      projectionPending: true,
    });
  });

  it("keeps a transport failure uncertain instead of treating it as a safe retry", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: { kind: "transport_ambiguous" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "transport_error" });
  });

  it("preserves a confirmed transactional RPC rejection as rejected", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: {
          kind: "rpc_rejection",
          message: "A jury ballot for your country is already recorded",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "rejected",
      message: "A jury ballot for your country is already recorded",
    });
  });

  it("provides a stable fallback for an empty server rejection message", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: { kind: "rpc_rejection", message: "   " },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "rejected", message: "Jury ballot rejected" });
  });

  it("treats a success without a ballot id as uncertain", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: { kind: "rpc_success", ballotId: "   " },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "uncertain",
      reason: "invalid_success_missing_ballot",
    });
  });

  it("accepts a future authoritative receipt only for the exact ballot and operation identity", () => {
    const outcome = adaptV3JuryRpcOutcome({
      outcome: {
        kind: "rpc_success",
        ballotId: "ballot-42",
        receipt: {
          receiptId: "receipt-42",
          entityId: "ballot-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:jury-result-42",
          identity: IDENTITY,
        },
      },
      clientObservedAt: 99_999,
      expectedIdentity: IDENTITY,
    });

    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.evidence.authority).toBe("authoritative_server");
    expect(classifyV3ReceiptEvidence(outcome.evidence).auditReady).toBe(true);
    if (outcome.evidence.authority !== "authoritative_server") return;
    expect(outcome.evidence.entityId).toBe("ballot-42");
    expect(outcome.evidence.serverAcceptedAt).toBe(10_000);
  });

  it("rejects an authoritative-looking receipt when expected identity is missing", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: {
          kind: "rpc_success",
          ballotId: "ballot-42",
          receipt: {
            receiptId: "receipt-42",
            entityId: "ballot-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:jury-result-42",
            identity: IDENTITY,
          },
        },
        clientObservedAt: 11_000,
      }),
    ).toEqual({
      kind: "identity_conflict",
      reason: "missing_expected_identity",
    });
  });

  it("rejects a receipt for another ballot entity", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: {
          kind: "rpc_success",
          ballotId: "ballot-42",
          receipt: {
            receiptId: "receipt-other",
            entityId: "ballot-99",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:jury-result-99",
            identity: IDENTITY,
          },
        },
        clientObservedAt: 11_000,
        expectedIdentity: IDENTITY,
      }),
    ).toEqual({
      kind: "identity_conflict",
      reason: "receipt_entity_mismatch",
    });
  });

  it("rejects a receipt for another operation identity", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: {
          kind: "rpc_success",
          ballotId: "ballot-42",
          receipt: {
            receiptId: "receipt-42",
            entityId: "ballot-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:jury-result-42",
            identity: { ...IDENTITY, requestHash: "sha256:other" },
          },
        },
        clientObservedAt: 11_000,
        expectedIdentity: IDENTITY,
      }),
    ).toEqual({
      kind: "identity_conflict",
      reason: "receipt_identity_mismatch",
    });
  });

  it("rejects malformed authoritative receipt fields instead of silently downgrading authority", () => {
    expect(
      adaptV3JuryRpcOutcome({
        outcome: {
          kind: "rpc_success",
          ballotId: "ballot-42",
          receipt: {
            receiptId: "",
            entityId: "ballot-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:jury-result-42",
            identity: IDENTITY,
          },
        },
        clientObservedAt: 11_000,
        expectedIdentity: IDENTITY,
      }),
    ).toEqual({ kind: "identity_conflict", reason: "invalid_receipt" });
  });

  it("requires a valid client observation timestamp only for legacy success evidence", () => {
    expect(() =>
      adaptV3JuryRpcOutcome({
        outcome: { kind: "rpc_success", ballotId: "ballot-42" },
        clientObservedAt: -1,
      }),
    ).toThrow("clientObservedAt must be a finite non-negative number");

    expect(
      adaptV3JuryRpcOutcome({
        outcome: { kind: "transport_ambiguous" },
        clientObservedAt: -1,
      }),
    ).toEqual({ kind: "uncertain", reason: "transport_error" });
  });
});
