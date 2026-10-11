import {
  createV3AuthoritativeReceipt,
  createV3LegacyServerSuccessEvidence,
  matchV3ReceiptIdentity,
  type V3AuthoritativeReceipt,
  type V3LegacyServerSuccessEvidence,
  type V3ReceiptIdentity,
  type V3ReceiptProjectionState,
} from "./v3-authoritative-receipt";

export type V3LegacyConfirmationError =
  | "duplicate_song"
  | "duplicate_artist"
  | "confirmation_already_complete"
  | "editing_closed";

export type V3ConfirmationReceiptWire = {
  receiptId: string;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  identity: V3ReceiptIdentity;
};

/**
 * Shape intentionally mirrors the current `submitConfirmation` result while
 * allowing a future server implementation to attach an authoritative receipt.
 */
export type V3ConfirmationServerResult = {
  ok: boolean;
  error?: string;
  reason?: string;
  submission_id?: string;
  canonical_sync?: V3ReceiptProjectionState;
  receipt?: V3ConfirmationReceiptWire;
};

export type V3ConfirmationCommittedOutcome = {
  kind: "committed";
  submissionId: string;
  canonicalSync: V3ReceiptProjectionState;
  evidence: V3AuthoritativeReceipt | V3LegacyServerSuccessEvidence;
};

export type V3ConfirmationMigrationOutcome =
  | V3ConfirmationCommittedOutcome
  | {
      kind: "blocked";
      reason: string;
    }
  | {
      kind: "rejected";
      error: V3LegacyConfirmationError;
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
      reason:
        | "transport_error"
        | "server_error"
        | "invalid_success_missing_submission"
        | "unknown_server_result";
    };

const EXPLICIT_REJECTIONS = new Set<V3LegacyConfirmationError>([
  "duplicate_song",
  "duplicate_artist",
  "confirmation_already_complete",
  "editing_closed",
]);

function projectionState(
  value: V3ConfirmationServerResult["canonical_sync"],
): V3ReceiptProjectionState {
  // Missing projection evidence must fail safe to pending. The participant
  // mutation may still be committed even if the downstream canonical view is
  // not yet known to be synchronized.
  return value === "synced" ? "synced" : "pending";
}

function isExplicitRejection(value: string): value is V3LegacyConfirmationError {
  return EXPLICIT_REJECTIONS.has(value as V3LegacyConfirmationError);
}

/**
 * Converts the current Confirmation server result into migration-safe V3
 * workflow evidence without changing the production endpoint.
 *
 * Important: generic server/transport failure is NOT a proven rejection. The
 * protected mutation may have committed before the response was lost. Those
 * outcomes remain uncertain until canonical server reconciliation resolves
 * them; callers must not blindly retry with a fresh operation identity.
 */
export function adaptV3ConfirmationResult(input: {
  result: V3ConfirmationServerResult;
  clientObservedAt: number;
  expectedIdentity?: V3ReceiptIdentity;
}): V3ConfirmationMigrationOutcome {
  const { result } = input;

  if (result.ok) {
    if (!result.submission_id?.trim()) {
      return { kind: "uncertain", reason: "invalid_success_missing_submission" };
    }

    const canonicalSync = projectionState(result.canonical_sync);

    if (!result.receipt) {
      return {
        kind: "committed",
        submissionId: result.submission_id,
        canonicalSync,
        evidence: createV3LegacyServerSuccessEvidence({
          workflow: "confirmation",
          entityId: result.submission_id,
          clientObservedAt: input.clientObservedAt,
          projectionState: canonicalSync,
        }),
      };
    }

    if (!input.expectedIdentity) {
      return { kind: "identity_conflict", reason: "missing_expected_identity" };
    }

    if (result.receipt.entityId !== result.submission_id) {
      return { kind: "identity_conflict", reason: "receipt_entity_mismatch" };
    }

    let receipt: V3AuthoritativeReceipt;
    try {
      receipt = createV3AuthoritativeReceipt({
        receiptId: result.receipt.receiptId,
        workflow: "confirmation",
        identity: result.receipt.identity,
        entityId: result.receipt.entityId,
        serverAcceptedAt: result.receipt.serverAcceptedAt,
        resultHash: result.receipt.resultHash,
        projectionState: canonicalSync,
      });
    } catch {
      return { kind: "identity_conflict", reason: "invalid_receipt" };
    }

    if (!matchV3ReceiptIdentity(receipt, input.expectedIdentity).matches) {
      return { kind: "identity_conflict", reason: "receipt_identity_mismatch" };
    }

    return {
      kind: "committed",
      submissionId: result.submission_id,
      canonicalSync,
      evidence: receipt,
    };
  }

  if (result.reason?.trim()) {
    return { kind: "blocked", reason: result.reason };
  }

  if (result.error && isExplicitRejection(result.error)) {
    return { kind: "rejected", error: result.error };
  }

  if (result.error === "server") {
    return { kind: "uncertain", reason: "server_error" };
  }

  return { kind: "uncertain", reason: "unknown_server_result" };
}

/**
 * Transport exceptions happen outside the legacy result object. They are
 * always ambiguous after dispatch and therefore never become a retryable
 * rejection by themselves.
 */
export function adaptV3ConfirmationTransportFailure(): V3ConfirmationMigrationOutcome {
  return { kind: "uncertain", reason: "transport_error" };
}
