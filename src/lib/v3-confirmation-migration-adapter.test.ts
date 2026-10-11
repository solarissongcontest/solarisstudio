import { describe, expect, it } from "vitest";

import {
  adaptV3ConfirmationResult,
  adaptV3ConfirmationTransportFailure,
} from "./v3-confirmation-migration-adapter";
import {
  classifyV3ReceiptEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

const IDENTITY: V3ReceiptIdentity = {
  idempotencyKey: "confirmation:ssc22:oland:42",
  requestHash: "sha256:request-42",
  actorId: "oland",
  action: "confirmation.submit",
  contextKey: "ssc22:round-1",
};

describe("Solaris Studio V3 Confirmation migration adapter", () => {
  it("bridges today's explicit successful response as committed legacy evidence", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        canonical_sync: "synced",
      },
      clientObservedAt: 5_000,
    });

    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.submissionId).toBe("submission-42");
    expect(outcome.evidence.authority).toBe("legacy_server_success");
    expect(classifyV3ReceiptEvidence(outcome.evidence)).toEqual({
      workflowCommitted: true,
      auditReady: false,
      needsReceiptReconciliation: true,
      projectionPending: false,
    });
  });

  it("fails missing canonical-sync evidence safe to pending without undoing commit", () => {
    const outcome = adaptV3ConfirmationResult({
      result: { ok: true, submission_id: "submission-42" },
      clientObservedAt: 5_000,
    });

    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.canonicalSync).toBe("pending");
    expect(classifyV3ReceiptEvidence(outcome.evidence).workflowCommitted).toBe(true);
    expect(classifyV3ReceiptEvidence(outcome.evidence).projectionPending).toBe(true);
  });

  it("accepts a future authoritative receipt only when it matches the expected operation identity", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        canonical_sync: "synced",
        receipt: {
          receiptId: "receipt-42",
          entityId: "submission-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:result-42",
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
    expect(outcome.evidence.serverAcceptedAt).toBe(10_000);
    expect(outcome.evidence.entityId).toBe("submission-42");
  });

  it("does not trust an authoritative-looking receipt when the caller lacks expected identity", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        receipt: {
          receiptId: "receipt-42",
          entityId: "submission-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:result-42",
          identity: IDENTITY,
        },
      },
      clientObservedAt: 11_000,
    });

    expect(outcome).toEqual({
      kind: "identity_conflict",
      reason: "missing_expected_identity",
    });
  });

  it("rejects a receipt attached to a different committed entity", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        receipt: {
          receiptId: "receipt-other",
          entityId: "submission-99",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:result-99",
          identity: IDENTITY,
        },
      },
      clientObservedAt: 11_000,
      expectedIdentity: IDENTITY,
    });

    expect(outcome).toEqual({
      kind: "identity_conflict",
      reason: "receipt_entity_mismatch",
    });
  });

  it("rejects receipt identity mismatch instead of attaching it to the wrong submission attempt", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        receipt: {
          receiptId: "receipt-42",
          entityId: "submission-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:result-42",
          identity: { ...IDENTITY, requestHash: "sha256:other" },
        },
      },
      clientObservedAt: 11_000,
      expectedIdentity: IDENTITY,
    });

    expect(outcome).toEqual({
      kind: "identity_conflict",
      reason: "receipt_identity_mismatch",
    });
  });

  it("rejects malformed receipt fields instead of silently downgrading them to legacy evidence", () => {
    const outcome = adaptV3ConfirmationResult({
      result: {
        ok: true,
        submission_id: "submission-42",
        receipt: {
          receiptId: "",
          entityId: "submission-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:result-42",
          identity: IDENTITY,
        },
      },
      clientObservedAt: 11_000,
      expectedIdentity: IDENTITY,
    });

    expect(outcome).toEqual({ kind: "identity_conflict", reason: "invalid_receipt" });
  });

  it("treats a generic server error as uncertain rather than a safe rejection", () => {
    expect(
      adaptV3ConfirmationResult({
        result: { ok: false, error: "server" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "server_error" });
  });

  it("treats a transport exception as uncertain rather than permission to retry", () => {
    expect(adaptV3ConfirmationTransportFailure()).toEqual({
      kind: "uncertain",
      reason: "transport_error",
    });
  });

  it.each([
    "duplicate_song",
    "duplicate_artist",
    "confirmation_already_complete",
    "editing_closed",
  ] as const)("preserves explicit %s rejection", (error) => {
    expect(
      adaptV3ConfirmationResult({
        result: { ok: false, error },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "rejected", error });
  });

  it("preserves an explicit availability block", () => {
    expect(
      adaptV3ConfirmationResult({
        result: { ok: false, reason: "closed" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "blocked", reason: "closed" });
  });

  it("treats success without a committed submission ID as uncertain", () => {
    expect(
      adaptV3ConfirmationResult({
        result: { ok: true, canonical_sync: "synced" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "uncertain",
      reason: "invalid_success_missing_submission",
    });
  });

  it("fails unknown negative responses closed into uncertainty", () => {
    expect(
      adaptV3ConfirmationResult({
        result: { ok: false, error: "mystery" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "unknown_server_result" });
  });
});
