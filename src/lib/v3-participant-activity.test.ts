import { describe, expect, it } from "vitest";

import {
  emptyV3ParticipantActivityBundle,
  getV3ParticipantActivityNextCursor,
  mergeV3ParticipantActivityPages,
  parseV3ParticipantActivity,
} from "./v3-participant-activity";

describe("V3 participant activity projection", () => {
  it("parses canonical recipient activity without exposing arbitrary routes", () => {
    const parsed = parseV3ParticipantActivity({
      items: [
        {
          id: "activity-1",
          occurred_at: "2026-10-16T10:00:00Z",
          kind: "receipt",
          title: "Entry submission accepted",
          description: "Receipt recorded for your current entry.",
          edition_id: "edition-1",
          edition_label: "SSC 22",
          country_id: "country-1",
          route: "/participate",
          receipt_id: "receipt-1",
          source_event_type: "entry.submitted",
          reconciliation_state: "current",
        },
        {
          id: "activity-2",
          occurred_at: "2026-10-15T10:00:00Z",
          kind: "other_future_kind",
          title: "Historical action",
          route: "https://evil.example/steal-session",
          source_event_type: "future.changed",
          reconciliation_state: "superseded",
        },
      ],
      next_before: "2026-10-15T10:00:00Z",
      next_operation_id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
      generated_at: "2026-10-16T10:01:00Z",
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      kind: "receipt",
      route: "/participate",
      receiptId: "receipt-1",
      reconciliationState: "current",
    });
    expect(parsed.items[1]).toMatchObject({
      kind: "other",
      route: null,
      reconciliationState: "superseded",
    });
    expect(getV3ParticipantActivityNextCursor(parsed)).toEqual({
      before: "2026-10-15T10:00:00Z",
      operationId: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
    });
  });

  it("fails closed when reconciliation state is missing or unknown", () => {
    const parsed = parseV3ParticipantActivity({
      items: [
        {
          id: "missing-state",
          occurred_at: "2026-10-16T10:00:00Z",
          kind: "receipt",
          title: "Receipt with incomplete reconciliation evidence",
          source_event_type: "entry.submitted",
        },
        {
          id: "future-state",
          occurred_at: "2026-10-15T10:00:00Z",
          kind: "submission",
          title: "Future reconciliation state",
          route: "/participate",
          source_event_type: "confirmation.submitted",
          reconciliation_state: "future_state_not_understood_by_this_client",
        },
      ],
    });

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.reconciliationState).toBe("unavailable");
    expect(parsed.items[1]).toMatchObject({
      reconciliationState: "unavailable",
      route: "/participate",
    });
  });

  it("rejects incomplete or malformed continuation cursors", () => {
    const missingTieBreak = parseV3ParticipantActivity({
      items: [],
      next_before: "2026-10-15T10:00:00Z",
    });
    const malformedTieBreak = parseV3ParticipantActivity({
      items: [],
      next_before: "2026-10-15T10:00:00Z",
      next_operation_id: "not-a-uuid",
    });

    expect(getV3ParticipantActivityNextCursor(missingTieBreak)).toBeNull();
    expect(getV3ParticipantActivityNextCursor(malformedTieBreak)).toBeNull();
    expect(missingTieBreak.nextBefore).toBeNull();
    expect(malformedTieBreak.nextOperationId).toBeNull();
  });

  it("deduplicates overlapping pages without hiding the newest canonical row", () => {
    const first = parseV3ParticipantActivity({
      items: [
        {
          id: "same-operation",
          occurred_at: "2026-10-16T10:00:00Z",
          kind: "submission",
          title: "Current entry version",
          source_event_type: "entry.version_changed",
          reconciliation_state: "current",
        },
      ],
    });
    const older = parseV3ParticipantActivity({
      items: [
        {
          id: "same-operation",
          occurred_at: "2026-10-16T10:00:00Z",
          kind: "submission",
          title: "Duplicate replay row",
          source_event_type: "entry.version_changed",
          reconciliation_state: "superseded",
        },
        {
          id: "older-operation",
          occurred_at: "2026-10-15T10:00:00Z",
          kind: "jury_participation",
          title: "Jury ballot submitted",
          source_event_type: "jury.ballot_submitted",
          reconciliation_state: "current",
        },
      ],
    });

    expect(mergeV3ParticipantActivityPages([first, older]).map((item) => item.id)).toEqual([
      "same-operation",
      "older-operation",
    ]);
    expect(mergeV3ParticipantActivityPages([first, older])[0]?.title).toBe(
      "Current entry version",
    );
  });

  it("drops malformed rows instead of inventing activity truth", () => {
    const parsed = parseV3ParticipantActivity({
      items: [
        { id: "missing-required-fields" },
        null,
        "browser history",
      ],
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.items).toEqual([]);
  });

  it("fails closed when no canonical projection payload exists", () => {
    expect(parseV3ParticipantActivity(null)).toEqual(emptyV3ParticipantActivityBundle());
  });
});
