import { describe, expect, it } from "vitest";

import {
  emptyV3ParticipantActivityBundle,
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
      next_operation_id: "10000000-0000-4000-8000-000000000002",
      generated_at: "2026-10-16T10:01:00Z",
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.nextBefore).toBe("2026-10-15T10:00:00Z");
    expect(parsed.nextOperationId).toBe("10000000-0000-4000-8000-000000000002");
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

  it("fails closed when no canonical projection payload exists", () => {
    expect(parseV3ParticipantActivity(null)).toEqual(emptyV3ParticipantActivityBundle());
  });
});
