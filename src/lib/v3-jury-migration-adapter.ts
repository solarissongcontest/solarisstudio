import {
  createV3AuthoritativeReceipt,
  createV3LegacyServerSuccessEvidence,
  matchV3ReceiptIdentity,
  type V3AuthoritativeReceipt,
  type V3LegacyServerSuccessEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";

export type V3JuryReceiptWire = {
  receiptId: string;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  identity: V3ReceiptIdentity;
};

export type V3JuryRpcOutcome =
  | {
      kind: "rpc_success";
      ballotId: string;
      receipt?: V3JuryReceiptWire;
    }
  | {
      kind: "rpc_rejection";
      message: string;
    }
  | {
      kind: "transport_ambiguous";
    };

export type V3JuryCommittedOutcome = {
  kind: "committed";
  ballotId: string;
  evidence: V3AuthoritativeReceipt | V3LegacyServerSuccessEvidence;
};

export type V3JuryMigrationOutcome =
  | V3JuryCommittedOutcome
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
      reason: "transport_error" | "invalid_success_missing_ballot";
    };

function requireObservedAt(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("clientObservedAt must be a finite non-negative number");
  }
}

/**
 * Bridges the existing jury ballot RPC into V3 workflow evidence without
 * changing the live route or database function.
 *
 * A PostgreSQL RPC rejection is authoritative rollback evidence because the
 * protected function runs transactionally: if the function raises, its writes
 * do not commit. A transport failure after dispatch is different. The client
 * cannot know whether the server committed before the response disappeared, so
 * transport ambiguity must remain uncertain until server reconciliation.
 */
export function adaptV3JuryRpcOutcome(input: {
  outcome: V3JuryRpcOutcome;
  clientObservedAt: number;
  expectedIdentity?: V3ReceiptIdentity;
}): V3JuryMigrationOutcome {
  const { outcome } = input;

  if (outcome.kind === "transport_ambiguous") {
    return { kind: "uncertain", reason: "transport_error" };
  }

  if (outcome.kind === "rpc_rejection") {
    if (!outcome.message.trim()) {
      return { kind: "rejected", message: "Jury ballot rejected" };
    }
    return { kind: "rejected", message: outcome.message };
  }

  const ballotId = outcome.ballotId.trim();
  if (!ballotId) {
    return { kind: "uncertain", reason: "invalid_success_missing_ballot" };
  }

  if (!outcome.receipt) {
    requireObservedAt(input.clientObservedAt);
    return {
      kind: "committed",
      ballotId,
      evidence: createV3LegacyServerSuccessEvidence({
        workflow: "jury",
        entityId: ballotId,
        clientObservedAt: input.clientObservedAt,
        projectionState: "pending",
      }),
    };
  }

  if (!input.expectedIdentity) {
    return { kind: "identity_conflict", reason: "missing_expected_identity" };
  }

  if (outcome.receipt.entityId !== ballotId) {
    return { kind: "identity_conflict", reason: "receipt_entity_mismatch" };
  }

  let receipt: V3AuthoritativeReceipt;
  try {
    receipt = createV3AuthoritativeReceipt({
      receiptId: outcome.receipt.receiptId,
      workflow: "jury",
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

  return { kind: "committed", ballotId, evidence: receipt };
}
