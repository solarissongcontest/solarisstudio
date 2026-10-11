import type {
  V3AuthoritativeReceipt,
  V3LegacyServerSuccessEvidence,
  V3ReceiptEvidence,
  V3ReceiptIdentity,
  V3ReceiptProjectionState,
  V3ReceiptWorkflow,
} from "./v3-authoritative-receipt";

export type V3ReceiptHistoryVerification =
  | "verified_receipt"
  | "awaiting_authoritative_receipt";

export type V3ReceiptHistoryTimeAuthority =
  | "server_accepted"
  | "client_observed";

export type V3ReceiptHistoryItem = {
  key: string;
  workflow: V3ReceiptWorkflow;
  entityId: string;
  committed: true;
  verification: V3ReceiptHistoryVerification;
  projectionState: V3ReceiptProjectionState;
  receiptId: string | null;
  displayTime: number;
  timeAuthority: V3ReceiptHistoryTimeAuthority;
  auditReady: boolean;
  canOpenOfficialReceipt: boolean;
};

export type V3ReceiptHistoryGroup = {
  verified: V3ReceiptHistoryItem[];
  awaitingReceipt: V3ReceiptHistoryItem[];
};

function requireTimestamp(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function historyKey(workflow: V3ReceiptWorkflow, entityId: string) {
  return `${workflow}:${entityId}`;
}

function sameIdentity(left: V3ReceiptIdentity, right: V3ReceiptIdentity) {
  return (
    left.idempotencyKey === right.idempotencyKey &&
    left.requestHash === right.requestHash &&
    left.actorId === right.actorId &&
    left.action === right.action &&
    left.contextKey === right.contextKey
  );
}

function projectAuthoritative(
  evidence: V3AuthoritativeReceipt,
): V3ReceiptHistoryItem {
  requireTimestamp(evidence.serverAcceptedAt, "serverAcceptedAt");
  return {
    key: historyKey(evidence.workflow, evidence.entityId),
    workflow: evidence.workflow,
    entityId: evidence.entityId,
    committed: true,
    verification: "verified_receipt",
    projectionState: evidence.projectionState,
    receiptId: evidence.receiptId,
    displayTime: evidence.serverAcceptedAt,
    timeAuthority: "server_accepted",
    auditReady: true,
    canOpenOfficialReceipt: true,
  };
}

function projectLegacy(
  evidence: V3LegacyServerSuccessEvidence,
): V3ReceiptHistoryItem {
  requireTimestamp(evidence.clientObservedAt, "clientObservedAt");
  return {
    key: historyKey(evidence.workflow, evidence.entityId),
    workflow: evidence.workflow,
    entityId: evidence.entityId,
    committed: true,
    verification: "awaiting_authoritative_receipt",
    projectionState: evidence.projectionState,
    receiptId: null,
    displayTime: evidence.clientObservedAt,
    timeAuthority: "client_observed",
    auditReady: false,
    canOpenOfficialReceipt: false,
  };
}

/**
 * Projects workflow evidence for Me / Activity without upgrading weak evidence.
 *
 * Legacy `clientObservedAt` may be displayed as "observed on this device", but
 * it is not official event chronology. Consumers must keep `timeAuthority`
 * visible in their model and must not relabel client time as server acceptance.
 */
export function projectV3ReceiptHistoryItem(
  evidence: V3ReceiptEvidence,
): V3ReceiptHistoryItem {
  return evidence.authority === "authoritative_server"
    ? projectAuthoritative(evidence)
    : projectLegacy(evidence);
}

function mergeAuthoritativeReceipts(
  current: V3AuthoritativeReceipt,
  incoming: V3AuthoritativeReceipt,
): V3AuthoritativeReceipt {
  const sameImmutableEvidence =
    current.receiptId === incoming.receiptId &&
    current.resultHash === incoming.resultHash &&
    current.serverAcceptedAt === incoming.serverAcceptedAt &&
    sameIdentity(current.identity, incoming.identity);

  if (!sameImmutableEvidence) {
    throw new Error("conflicting authoritative receipts for one workflow entity");
  }

  if (
    current.projectionState === "synced" ||
    incoming.projectionState === "synced"
  ) {
    return { ...current, projectionState: "synced" };
  }

  return current;
}

/**
 * Reconciles duplicate evidence for the same workflow entity.
 *
 * An authoritative receipt always upgrades matching legacy evidence. Legacy
 * evidence can never replace a verified receipt, even if its client clock is
 * later. Two authoritative receipts must agree on immutable receipt evidence;
 * disagreement is an integrity conflict, not a last-write-wins situation.
 */
export function mergeV3ReceiptHistoryEvidence(
  current: V3ReceiptEvidence,
  incoming: V3ReceiptEvidence,
): V3ReceiptEvidence {
  if (
    current.workflow !== incoming.workflow ||
    current.entityId !== incoming.entityId
  ) {
    throw new Error("cannot merge receipt evidence for different workflow entities");
  }

  if (
    current.authority === "authoritative_server" &&
    incoming.authority === "authoritative_server"
  ) {
    return mergeAuthoritativeReceipts(current, incoming);
  }

  if (current.authority === "authoritative_server") return current;
  if (incoming.authority === "authoritative_server") return incoming;

  // Both are legacy observations. Keep the earliest observation rather than
  // pretending repeated client sightings are new workflow commits.
  return incoming.clientObservedAt < current.clientObservedAt
    ? incoming
    : current;
}

/**
 * Groups projected history by evidence strength. Sorting occurs only within
 * the same time-authority class. Mixing server acceptance and device clock
 * values into one chronological list would imply precision we do not have.
 */
export function groupV3ReceiptHistory(
  evidence: V3ReceiptEvidence[],
): V3ReceiptHistoryGroup {
  const byEntity = new Map<string, V3ReceiptEvidence>();

  for (const item of evidence) {
    const key = historyKey(item.workflow, item.entityId);
    const existing = byEntity.get(key);
    byEntity.set(
      key,
      existing ? mergeV3ReceiptHistoryEvidence(existing, item) : item,
    );
  }

  const projected = [...byEntity.values()].map(projectV3ReceiptHistoryItem);
  const newestFirst = (a: V3ReceiptHistoryItem, b: V3ReceiptHistoryItem) =>
    b.displayTime - a.displayTime || a.key.localeCompare(b.key);

  return {
    verified: projected
      .filter((item) => item.verification === "verified_receipt")
      .sort(newestFirst),
    awaitingReceipt: projected
      .filter((item) => item.verification === "awaiting_authoritative_receipt")
      .sort(newestFirst),
  };
}
