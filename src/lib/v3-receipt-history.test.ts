import { describe, expect, it } from "vitest";

import {
  createV3AuthoritativeReceipt,
  createV3LegacyServerSuccessEvidence,
  type V3ReceiptIdentity,
} from "./v3-authoritative-receipt";
import {
  groupV3ReceiptHistory,
  mergeV3ReceiptHistoryEvidence,
  projectV3ReceiptHistoryItem,
} from "./v3-receipt-history";

const IDENTITY: V3ReceiptIdentity = {
  idempotencyKey: "confirmation:ssc22:oland:42",
  requestHash: "sha256:request-42",
  actorId: "oland",
  action: "confirmation.submit",
  contextKey: "ssc22:round-1",
};

function authoritative(overrides: Partial<{
  receiptId: string;
  entityId: string;
  serverAcceptedAt: number;
  resultHash: string;
  projectionState: "synced" | "pending";
}> = {}) {
  return createV3AuthoritativeReceipt({
    receiptId: overrides.receiptId ?? "receipt-42",
    workflow: "confirmation",
    identity: IDENTITY,
    entityId: overrides.entityId ?? "submission-42",
    serverAcceptedAt: overrides.serverAcceptedAt ?? 10_000,
    resultHash: overrides.resultHash ?? "sha256:result-42",
    projectionState: overrides.projectionState ?? "synced",
  });
}

function legacy(clientObservedAt = 99_999) {
  return createV3LegacyServerSuccessEvidence({
    workflow: "confirmation",
    entityId: "submission-42",
    clientObservedAt,
    projectionState: "pending",
  });
}

describe("Solaris Studio V3 receipt history projection", () => {
  it("projects authoritative evidence as a verified official receipt", () => {
    expect(projectV3ReceiptHistoryItem(authoritative())).toEqual({
      key: "confirmation:submission-42",
      workflow: "confirmation",
      entityId: "submission-42",
      committed: true,
      verification: "verified_receipt",
      projectionState: "synced",
      receiptId: "receipt-42",
      displayTime: 10_000,
      timeAuthority: "server_accepted",
      auditReady: true,
      canOpenOfficialReceipt: true,
    });
  });

  it("shows legacy completion without pretending its device time is official chronology", () => {
    const item = projectV3ReceiptHistoryItem(legacy());

    expect(item.committed).toBe(true);
    expect(item.verification).toBe("awaiting_authoritative_receipt");
    expect(item.timeAuthority).toBe("client_observed");
    expect(item.auditReady).toBe(false);
    expect(item.canOpenOfficialReceipt).toBe(false);
    expect(item.receiptId).toBeNull();
  });

  it("upgrades legacy evidence when an authoritative receipt arrives even if the client clock was later", () => {
    const merged = mergeV3ReceiptHistoryEvidence(legacy(999_999), authoritative({ serverAcceptedAt: 10 }));

    expect(merged.authority).toBe("authoritative_server");
    if (merged.authority !== "authoritative_server") return;
    expect(merged.serverAcceptedAt).toBe(10);
  });

  it("never lets later legacy device observation downgrade a verified receipt", () => {
    const verified = authoritative({ serverAcceptedAt: 10 });
    expect(mergeV3ReceiptHistoryEvidence(verified, legacy(999_999))).toBe(verified);
  });

  it("keeps the earliest of repeated legacy observations instead of fabricating a new commit time", () => {
    const first = legacy(100);
    const later = legacy(300);

    expect(mergeV3ReceiptHistoryEvidence(later, first)).toBe(first);
    expect(mergeV3ReceiptHistoryEvidence(first, later)).toBe(first);
  });

  it("allows the same authoritative receipt to upgrade projection state from pending to synced", () => {
    const pending = authoritative({ projectionState: "pending" });
    const synced = authoritative({ projectionState: "synced" });
    const merged = mergeV3ReceiptHistoryEvidence(pending, synced);

    expect(merged.authority).toBe("authoritative_server");
    expect(merged.projectionState).toBe("synced");
  });

  it.each([
    ["receipt ID", authoritative({ receiptId: "receipt-other" })],
    ["result hash", authoritative({ resultHash: "sha256:other" })],
    ["server acceptance time", authoritative({ serverAcceptedAt: 20_000 })],
  ] as const)("rejects conflicting authoritative %s", (_label, incoming) => {
    expect(() =>
      mergeV3ReceiptHistoryEvidence(authoritative(), incoming),
    ).toThrow("conflicting authoritative receipts for one workflow entity");
  });

  it("rejects attempts to merge different workflow entities", () => {
    const other = createV3LegacyServerSuccessEvidence({
      workflow: "jury",
      entityId: "ballot-1",
      clientObservedAt: 100,
      projectionState: "synced",
    });

    expect(() => mergeV3ReceiptHistoryEvidence(legacy(), other)).toThrow(
      "cannot merge receipt evidence for different workflow entities",
    );
  });

  it("groups verified and legacy history separately instead of mixing clock authorities", () => {
    const result = groupV3ReceiptHistory([
      legacy(999_999),
      createV3LegacyServerSuccessEvidence({
        workflow: "jury",
        entityId: "ballot-1",
        clientObservedAt: 50,
        projectionState: "synced",
      }),
      authoritative({ serverAcceptedAt: 100 }),
      createV3AuthoritativeReceipt({
        receiptId: "receipt-tv",
        workflow: "televote",
        identity: {
          ...IDENTITY,
          idempotencyKey: "televote:ssc22:viewer-1",
          action: "televote.submit",
        },
        entityId: "vote-1",
        serverAcceptedAt: 200,
        resultHash: "sha256:vote-result",
        projectionState: "synced",
      }),
    ]);

    expect(result.verified.map((item) => item.key)).toEqual([
      "televote:vote-1",
      "confirmation:submission-42",
    ]);
    expect(result.awaitingReceipt.map((item) => item.key)).toEqual([
      "jury:ballot-1",
    ]);
  });
});
