import { describe, expect, it } from "vitest";

import { adaptV3TelevoteServerOutcome } from "./v3-televote-migration-adapter";
import {
  classifyV3ReceiptEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

const IDENTITY: V3ReceiptIdentity = {
  idempotencyKey: "televote:ssc22:final:voter-42",
  requestHash: "sha256:televote-request-42",
  actorId: "voter-42",
  action: "televote.submit",
  contextKey: "ssc22:final",
};

const SUCCESS = {
  id: "submission-42",
  risk_score: 12,
  status: "active" as const,
  preflight_id: "preflight-42",
};

describe("Solaris Studio V3 Televote migration adapter", () => {
  it("bridges current successful Televote result as committed legacy evidence", () => {
    const outcome = adaptV3TelevoteServerOutcome({
      outcome: { kind: "server_success", result: SUCCESS },
      clientObservedAt: 5_000,
    });

    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") return;
    expect(outcome.submissionId).toBe("submission-42");
    expect(outcome.riskScore).toBe(12);
    expect(outcome.moderationStatus).toBe("active");
    expect(outcome.preflightId).toBe("preflight-42");
    expect(outcome.evidence.authority).toBe("legacy_server_success");
    expect(classifyV3ReceiptEvidence(outcome.evidence)).toEqual({
      workflowCommitted: true,
      auditReady: false,
      needsReceiptReconciliation: true,
      projectionPending: true,
    });
  });

  it("keeps transport failure uncertain rather than allowing blind resubmission", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: { kind: "transport_ambiguous" },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "transport_error" });
  });

  it("does not treat a network duplicate guard as proof this exact ballot was recorded", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_rejection",
          message: "A vote from this network was already recorded",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "blocked_duplicate_guard",
      reason: "network_duplicate",
      message: "A vote from this network was already recorded",
    });
  });

  it("does not treat a device duplicate guard as proof this exact ballot was recorded", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_rejection",
          message: "A vote from this device was already recorded",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "blocked_duplicate_guard",
      reason: "device_duplicate",
      message: "A vote from this device was already recorded",
    });
  });

  it("requires canonical reconciliation before treating same-username duplicate evidence as completed", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_rejection",
          message: "You have already voted in this round",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "already_recorded_needs_reconciliation",
      reason: "same_username_vote_exists",
      message: "You have already voted in this round",
    });
  });

  it("requires canonical reconciliation when the exact preflight token was already used", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_rejection",
          message: "This voting integrity check has already been used",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "already_recorded_needs_reconciliation",
      reason: "preflight_already_used",
      message: "This voting integrity check has already been used",
    });
  });

  it.each([
    [
      "Voting integrity check not found. Review the ballot again.",
      "integrity_check_missing",
    ],
    [
      "Review this ballot with the automatic voting integrity check before submitting",
      "integrity_check_missing",
    ],
    [
      "Voting integrity check expired. Review the ballot again.",
      "integrity_check_expired",
    ],
    [
      "Ballot changed after the integrity check. Review the updated ballot again.",
      "ballot_changed",
    ],
    [
      "Ballot identity changed after the integrity check. Review it again.",
      "identity_changed",
    ],
    [
      "Connection or device identity changed after the integrity check. Review the ballot again.",
      "identity_changed",
    ],
    [
      "This ballot requires the voting-integrity declaration before it can be submitted",
      "attestation_required",
    ],
  ] as const)("maps %s to recheck-required state", (message, reason) => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: { kind: "server_rejection", message },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "recheck_required", reason, message });
  });

  it("preserves ordinary server validation/rate-limit rejection as rejected", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_rejection",
          message: "Too many vote attempts from this connection. Please wait a moment.",
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({
      kind: "rejected",
      message: "Too many vote attempts from this connection. Please wait a moment.",
    });
  });

  it("fails malformed success payload closed into uncertainty", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: { ...SUCCESS, id: "" },
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "invalid_success_payload" });

    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: { ...SUCCESS, risk_score: 101 },
        },
        clientObservedAt: 5_000,
      }),
    ).toEqual({ kind: "uncertain", reason: "invalid_success_payload" });
  });

  it("accepts future authoritative receipt only for the exact submission and operation identity", () => {
    const outcome = adaptV3TelevoteServerOutcome({
      outcome: {
        kind: "server_success",
        result: SUCCESS,
        receipt: {
          receiptId: "receipt-42",
          entityId: "submission-42",
          serverAcceptedAt: 10_000,
          resultHash: "sha256:televote-result-42",
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
    expect(outcome.evidence.entityId).toBe("submission-42");
    expect(outcome.evidence.serverAcceptedAt).toBe(10_000);
  });

  it("rejects future receipt when expected operation identity is missing", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: SUCCESS,
          receipt: {
            receiptId: "receipt-42",
            entityId: "submission-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:televote-result-42",
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

  it("rejects future receipt bound to another submission", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: SUCCESS,
          receipt: {
            receiptId: "receipt-other",
            entityId: "submission-99",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:televote-result-99",
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

  it("rejects future receipt bound to another operation identity", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: SUCCESS,
          receipt: {
            receiptId: "receipt-42",
            entityId: "submission-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:televote-result-42",
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

  it("rejects malformed authoritative receipt rather than silently downgrading authority", () => {
    expect(
      adaptV3TelevoteServerOutcome({
        outcome: {
          kind: "server_success",
          result: SUCCESS,
          receipt: {
            receiptId: "",
            entityId: "submission-42",
            serverAcceptedAt: 10_000,
            resultHash: "sha256:televote-result-42",
            identity: IDENTITY,
          },
        },
        clientObservedAt: 11_000,
        expectedIdentity: IDENTITY,
      }),
    ).toEqual({ kind: "identity_conflict", reason: "invalid_receipt" });
  });
});
