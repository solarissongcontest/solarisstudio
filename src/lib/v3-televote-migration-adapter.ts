import {
  createV3AuthoritativeReceipt,
  createV3LegacyServerSuccessEvidence,
  matchV3ReceiptIdentity,
  type V3AuthoritativeReceipt,
  type V3LegacyServerSuccessEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

export type V3TelevoteModerationStatus = "active" | "suspicious";

export type V3TelevoteReceiptWire = {
  receiptId: string;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  identity: V3ReceiptIdentity;
};

export type V3LegacyTelevoteResult = {
  id: string;
  risk_score: number;
  status: V3TelevoteModerationStatus;
  preflight_id: string;
};

export type V3TelevoteServerOutcome =
  | {
      kind: "server_success";
      result: V3LegacyTelevoteResult;
      receipt?: V3TelevoteReceiptWire;
    }
  | {
      kind: "server_rejection";
      message: string;
    }
  | {
      kind: "transport_ambiguous";
    };

export type V3TelevoteMigrationOutcome =
  | {
      kind: "committed";
      submissionId: string;
      riskScore: number;
      moderationStatus: V3TelevoteModerationStatus;
      preflightId: string;
      evidence: V3AuthoritativeReceipt | V3LegacyServerSuccessEvidence;
    }
  | {
      kind: "already_recorded_needs_reconciliation";
      reason: "same_username_vote_exists" | "preflight_already_used";
      message: string;
    }
  | {
      kind: "blocked_duplicate_guard";
      reason: "network_duplicate" | "device_duplicate";
      message: string;
    }
  | {
      kind: "recheck_required";
      reason:
        | "integrity_check_missing"
        | "integrity_check_expired"
        | "ballot_changed"
        | "identity_changed"
        | "attestation_required";
      message: string;
    }
  | {
      kind: "rejected";
      message: string;
    }
  | {
      kind: "identity_conflict";
      reason:
        | "missing_expected_identity"
        | "receipt_identity_mismatch"
        | "receipt_entity_mismatch"
        | "invalid_receipt";
    }
  | {
      kind: "uncertain";
      reason: "transport_error" | "invalid_success_payload";
    };

function requireObservedAt(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("clientObservedAt must be a finite non-negative number");
  }
}

function validLegacySuccess(result: V3LegacyTelevoteResult) {
  return (
    Boolean(result.id.trim()) &&
    Boolean(result.preflight_id.trim()) &&
    Number.isSafeInteger(result.risk_score) &&
    result.risk_score >= 0 &&
    result.risk_score <= 100 &&
    (result.status === "active" || result.status === "suspicious")
  );
}

function classifyServerRejection(message: string): V3TelevoteMigrationOutcome {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  const safeMessage = normalized || "Televote submission rejected";

  if (lower.includes("you have already voted in this round")) {
    return {
      kind: "already_recorded_needs_reconciliation",
      reason: "same_username_vote_exists",
      message: safeMessage,
    };
  }

  if (lower.includes("voting integrity check has already been used")) {
    return {
      kind: "already_recorded_needs_reconciliation",
      reason: "preflight_already_used",
      message: safeMessage,
    };
  }

  if (lower.includes("vote from this network was already recorded")) {
    return {
      kind: "blocked_duplicate_guard",
      reason: "network_duplicate",
      message: safeMessage,
    };
  }

  if (lower.includes("vote from this device was already recorded")) {
    return {
      kind: "blocked_duplicate_guard",
      reason: "device_duplicate",
      message: safeMessage,
    };
  }

  if (
    lower.includes("voting integrity check not found") ||
    lower.includes("review this ballot with the automatic voting integrity check")
  ) {
    return {
      kind: "recheck_required",
      reason: "integrity_check_missing",
      message: safeMessage,
    };
  }

  if (lower.includes("voting integrity check expired")) {
    return {
      kind: "recheck_required",
      reason: "integrity_check_expired",
      message: safeMessage,
    };
  }

  if (lower.includes("ballot changed after the integrity check")) {
    return {
      kind: "recheck_required",
      reason: "ballot_changed",
      message: safeMessage,
    };
  }

  if (
    lower.includes("ballot identity changed after the integrity check") ||
    lower.includes("connection or device identity changed after the integrity check")
  ) {
    return {
      kind: "recheck_required",
      reason: "identity_changed",
      message: safeMessage,
    };
  }

  if (lower.includes("requires the voting-integrity declaration")) {
    return {
      kind: "recheck_required",
      reason: "attestation_required",
      message: safeMessage,
    };
  }

  return { kind: "rejected", message: safeMessage };
}

/**
 * Converts the existing Televote server boundary into V3-safe migration state.
 *
 * A confirmed server-function/PostgreSQL rejection means the attempted
 * transaction did not commit. A transport failure after dispatch is different:
 * the client cannot know whether the vote committed before the response was
 * lost, so transport ambiguity must remain uncertain until reconciliation.
 *
 * Duplicate-protection messages are intentionally not all treated as success.
 * A network/device duplicate only proves the guard found some existing vote;
 * it does not prove this exact ballot was previously committed. Even same-user
 * or used-preflight evidence requires canonical lookup before V3 shows a
 * verified completed vote.
 */
export function adaptV3TelevoteServerOutcome(input: {
  outcome: V3TelevoteServerOutcome;
  clientObservedAt: number;
  expectedIdentity?: V3ReceiptIdentity;
}): V3TelevoteMigrationOutcome {
  const { outcome } = input;

  if (outcome.kind === "transport_ambiguous") {
    return { kind: "uncertain", reason: "transport_error" };
  }

  if (outcome.kind === "server_rejection") {
    return classifyServerRejection(outcome.message);
  }

  if (!validLegacySuccess(outcome.result)) {
    return { kind: "uncertain", reason: "invalid_success_payload" };
  }

  const submissionId = outcome.result.id.trim();

  if (!outcome.receipt) {
    requireObservedAt(input.clientObservedAt);
    return {
      kind: "committed",
      submissionId,
      riskScore: outcome.result.risk_score,
      moderationStatus: outcome.result.status,
      preflightId: outcome.result.preflight_id.trim(),
      evidence: createV3LegacyServerSuccessEvidence({
        workflow: "televote",
        entityId: submissionId,
        clientObservedAt: input.clientObservedAt,
        projectionState: "pending",
      }),
    };
  }

  if (!input.expectedIdentity) {
    return { kind: "identity_conflict", reason: "missing_expected_identity" };
  }

  if (outcome.receipt.entityId !== submissionId) {
    return { kind: "identity_conflict", reason: "receipt_entity_mismatch" };
  }

  let receipt: V3AuthoritativeReceipt;
  try {
    receipt = createV3AuthoritativeReceipt({
      receiptId: outcome.receipt.receiptId,
      workflow: "televote",
      identity: outcome.receipt.identity,
      entityId: outcome.receipt.entityId,
      serverAcceptedAt: outcome.receipt.serverAcceptedAt,
      resultHash: outcome.receipt.resultHash,
      projectionState: "pending",
    });
  } catch {
    return { kind: "identity_conflict", reason: "invalid_receipt" };
  }

  if (!matchV3ReceiptIdentity(receipt, input.expectedIdentity).matches) {
    return { kind: "identity_conflict", reason: "receipt_identity_mismatch" };
  }

  return {
    kind: "committed",
    submissionId,
    riskScore: outcome.result.risk_score,
    moderationStatus: outcome.result.status,
    preflightId: outcome.result.preflight_id.trim(),
    evidence: receipt,
  };
}
