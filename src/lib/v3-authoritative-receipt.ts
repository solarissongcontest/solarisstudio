export type V3ReceiptWorkflow =
  | "confirmation"
  | "entry"
  | "media"
  | "jury"
  | "televote"
  | "organizer_action";

export type V3ReceiptProjectionState = "synced" | "pending";

export type V3ReceiptIdentity = {
  idempotencyKey: string;
  requestHash: string;
  actorId: string;
  action: string;
  contextKey: string;
};

export type V3AuthoritativeReceipt = {
  version: 1;
  authority: "authoritative_server";
  receiptId: string;
  workflow: V3ReceiptWorkflow;
  identity: V3ReceiptIdentity;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  projectionState: V3ReceiptProjectionState;
};

export type V3LegacyServerSuccessEvidence = {
  version: 1;
  authority: "legacy_server_success";
  workflow: V3ReceiptWorkflow;
  entityId: string;
  clientObservedAt: number;
  projectionState: V3ReceiptProjectionState;
};

export type V3ReceiptEvidence =
  | V3AuthoritativeReceipt
  | V3LegacyServerSuccessEvidence;

export type V3ReceiptIdentityMatch =
  | { matches: true }
  | {
      matches: false;
      reason:
        | "idempotency_key_mismatch"
        | "request_hash_mismatch"
        | "actor_mismatch"
        | "action_mismatch"
        | "context_mismatch";
    };

export type V3ReceiptEvidenceClassification = {
  workflowCommitted: boolean;
  auditReady: boolean;
  needsReceiptReconciliation: boolean;
  projectionPending: boolean;
};

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function requireTimestamp(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function validateIdentity(identity: V3ReceiptIdentity) {
  requireNonEmpty(identity.idempotencyKey, "identity.idempotencyKey");
  requireNonEmpty(identity.requestHash, "identity.requestHash");
  requireNonEmpty(identity.actorId, "identity.actorId");
  requireNonEmpty(identity.action, "identity.action");
  requireNonEmpty(identity.contextKey, "identity.contextKey");
}

/**
 * Builds an audit-grade receipt only from server-authoritative evidence.
 *
 * `serverAcceptedAt` and `resultHash` must be produced by the server-side
 * persistence boundary that knows the protected mutation committed. Client
 * time, browser storage and optimistic UI state are not receipt authority.
 */
export function createV3AuthoritativeReceipt(input: {
  receiptId: string;
  workflow: V3ReceiptWorkflow;
  identity: V3ReceiptIdentity;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  projectionState: V3ReceiptProjectionState;
}): V3AuthoritativeReceipt {
  requireNonEmpty(input.receiptId, "receiptId");
  validateIdentity(input.identity);
  requireNonEmpty(input.entityId, "entityId");
  requireTimestamp(input.serverAcceptedAt, "serverAcceptedAt");
  requireNonEmpty(input.resultHash, "resultHash");

  return {
    version: 1,
    authority: "authoritative_server",
    receiptId: input.receiptId,
    workflow: input.workflow,
    identity: { ...input.identity },
    entityId: input.entityId,
    serverAcceptedAt: input.serverAcceptedAt,
    resultHash: input.resultHash,
    projectionState: input.projectionState,
  };
}

/**
 * Bridges a legacy endpoint that returned an explicit success plus a committed
 * entity ID but did not return a server receipt timestamp/hash.
 *
 * This evidence is sufficient to avoid lying to the user that the workflow
 * failed. It is deliberately NOT promoted to an authoritative receipt. A
 * future reconciliation adapter must fetch/derive server receipt evidence.
 */
export function createV3LegacyServerSuccessEvidence(input: {
  workflow: V3ReceiptWorkflow;
  entityId: string;
  clientObservedAt: number;
  projectionState: V3ReceiptProjectionState;
}): V3LegacyServerSuccessEvidence {
  requireNonEmpty(input.entityId, "entityId");
  requireTimestamp(input.clientObservedAt, "clientObservedAt");

  return {
    version: 1,
    authority: "legacy_server_success",
    workflow: input.workflow,
    entityId: input.entityId,
    clientObservedAt: input.clientObservedAt,
    projectionState: input.projectionState,
  };
}

export function matchV3ReceiptIdentity(
  receipt: V3AuthoritativeReceipt,
  expected: V3ReceiptIdentity,
): V3ReceiptIdentityMatch {
  validateIdentity(expected);

  if (receipt.identity.idempotencyKey !== expected.idempotencyKey) {
    return { matches: false, reason: "idempotency_key_mismatch" };
  }
  if (receipt.identity.requestHash !== expected.requestHash) {
    return { matches: false, reason: "request_hash_mismatch" };
  }
  if (receipt.identity.actorId !== expected.actorId) {
    return { matches: false, reason: "actor_mismatch" };
  }
  if (receipt.identity.action !== expected.action) {
    return { matches: false, reason: "action_mismatch" };
  }
  if (receipt.identity.contextKey !== expected.contextKey) {
    return { matches: false, reason: "context_mismatch" };
  }

  return { matches: true };
}

export function classifyV3ReceiptEvidence(
  evidence: V3ReceiptEvidence,
): V3ReceiptEvidenceClassification {
  if (evidence.authority === "authoritative_server") {
    return {
      workflowCommitted: true,
      auditReady: true,
      needsReceiptReconciliation: false,
      projectionPending: evidence.projectionState === "pending",
    };
  }

  return {
    workflowCommitted: true,
    auditReady: false,
    needsReceiptReconciliation: true,
    projectionPending: evidence.projectionState === "pending",
  };
}

export function isV3AuthoritativeReceipt(
  evidence: V3ReceiptEvidence,
): evidence is V3AuthoritativeReceipt {
  return evidence.authority === "authoritative_server";
}

/**
 * Only an authoritative receipt bound to the exact operation identity is valid
 * audit/history evidence for that protected mutation.
 */
export function canUseV3ReceiptForOperation(
  evidence: V3ReceiptEvidence,
  expected: V3ReceiptIdentity,
) {
  if (!isV3AuthoritativeReceipt(evidence)) return false;
  return matchV3ReceiptIdentity(evidence, expected).matches;
}
