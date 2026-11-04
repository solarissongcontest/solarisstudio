import { describe, expect, it } from "vitest";

import {
  emptyV3ParticipantActivityBundle,
  parseV3ParticipantActivity,
  v3ParticipantActivityQueryKey,
  validateV3ParticipantActivityCursor,
} from "./v3-participant-activity";

describe("V3 participant activity projection", () => {
  it("partitions private activity cache keys by viewer identity", () => {
    expect(v3ParticipantActivityQueryKey("member-a")).toEqual([
      "v3-participant-activity", "member-a",
    ]);
    expect(v3ParticipantActivityQueryKey("member-b")).toEqual([
      "v3-participant-activity", "member-b",
    ]);
    expect(v3ParticipantActivityQueryKey("member-a")).not.toEqual(
      v3ParticipantActivityQueryKey("member-b"),
    );
    expect(v3ParticipantActivityQueryKey(null)).toEqual([
      "v3-participant-activity", "no-viewer",
    ]);
  });

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

  it("uses both server-owned keyset coordinates or no continuation at all", () => {
    const complete = parseV3ParticipantActivity({
      items: [],
      next_before: "2026-11-04T08:00:00+00:00",
      next_operation_id: "00000000-0000-4000-8000-00000000a721",
    });
    expect(complete.nextBefore).toBe("2026-11-04T08:00:00+00:00");
    expect(complete.nextOperationId).toBe("00000000-0000-4000-8000-00000000a721");

    const missingId = parseV3ParticipantActivity({
      items: [],
      next_before: "2026-11-04T08:00:00Z",
    });
    expect(missingId.nextBefore).toBeNull();
    expect(missingId.nextOperationId).toBeNull();

    const invalidId = parseV3ParticipantActivity({
      items: [],
      next_before: "2026-11-04T08:00:00Z",
      next_operation_id: "not-an-operation-id",
    });
    expect(invalidId.nextBefore).toBeNull();
    expect(invalidId.nextOperationId).toBeNull();
  });

  it("rejects arbitrary selectors and incomplete Activity cursors", () => {
    const before = "2026-11-04T08:00:00Z";
    const operationId = "00000000-0000-4000-8000-00000000a721";
    expect(validateV3ParticipantActivityCursor(undefined)).toEqual({
      before: null,
      operationId: null,
    });
    expect(validateV3ParticipantActivityCursor({ before, operationId })).toEqual({
      before,
      operationId,
    });
    expect(() => validateV3ParticipantActivityCursor({ before })).toThrow("complete");
    expect(() => validateV3ParticipantActivityCursor({ operationId })).toThrow("complete");
    expect(() => validateV3ParticipantActivityCursor({ before: "invalid", operationId })).toThrow("complete");
    expect(() => validateV3ParticipantActivityCursor({
      before,
      operationId,
      actor: "another-account",
    })).toThrow("Invalid Activity pagination input");
  });

  it("fails closed when no canonical projection payload exists", () => {
    expect(parseV3ParticipantActivity(null)).toEqual(emptyV3ParticipantActivityBundle());
  });
});
