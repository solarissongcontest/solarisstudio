import { describe, expect, it } from "vitest";

import {
  parseV3NextInLineProjection,
  parseV3NextInLineReceipt,
} from "./v3-next-in-line";

describe("V3 Next in Line projection", () => {
  it("parses only server-authorized contexts and immutable submission evidence", () => {
    const projection = parseV3NextInLineProjection(
      {
        editionId: "11111111-1111-4111-8111-111111111111",
        state: "submitted",
        window: {
          status: "open",
          enabled: true,
          opensAt: "2026-10-16T10:00:00Z",
          closesAt: "2026-10-20T20:00:00Z",
          version: 3,
          effectiveOpen: true,
        },
        contexts: [
          {
            country: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Oland",
              shortCode: "OLA",
            },
            sourceSubmissionId: "33333333-3333-4333-8333-333333333333",
            selectionMethod: "national_final",
            eligible: true,
            candidates: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                artist: "Artist",
                songTitle: "Runner-up",
                songUrl: "https://example.test/song",
                position: 2,
              },
            ],
            submission: {
              id: "55555555-5555-4555-8555-555555555555",
              revision: 2,
              selectionType: "national_final",
              nationalFinalEntryId: "44444444-4444-4444-8444-444444444444",
              artist: "Artist",
              songTitle: "Runner-up",
              songUrl: "https://example.test/song",
              previewStart: "01:20",
              previewEnd: "01:45",
              submittedAt: "2026-10-16T12:00:00Z",
              updatedAt: "2026-10-16T12:05:00Z",
              lastOperationId: "66666666-6666-4666-8666-666666666666",
              history: [
                {
                  revision: 2,
                  operationId: "66666666-6666-4666-8666-666666666666",
                  createdAt: "2026-10-16T12:05:00Z",
                  snapshot: { songTitle: "Runner-up" },
                },
              ],
              lastOperation: {
                operationId: "66666666-6666-4666-8666-666666666666",
                correlationId: "77777777-7777-4777-8777-777777777777",
                status: "succeeded",
                createdAt: "2026-10-16T12:05:00Z",
                updatedAt: "2026-10-16T12:05:01Z",
                completedAt: "2026-10-16T12:05:01Z",
              },
            },
          },
        ],
        serverTime: "2026-10-16T12:06:00Z",
      },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(projection.window?.effectiveOpen).toBe(true);
    expect(projection.contexts).toHaveLength(1);
    expect(projection.contexts[0]).toMatchObject({
      country: { name: "Oland", shortCode: "OLA" },
      selectionMethod: "national_final",
      eligible: true,
    });
    expect(projection.contexts[0].submission).toMatchObject({
      revision: 2,
      lastOperationId: "66666666-6666-4666-8666-666666666666",
    });
    expect(projection.contexts[0].submission?.history).toHaveLength(1);
  });

  it("fails closed on edition scope mismatch", () => {
    expect(() =>
      parseV3NextInLineProjection(
        {
          editionId: "11111111-1111-4111-8111-111111111111",
          state: "open",
          contexts: [],
          serverTime: "2026-10-16T12:06:00Z",
        },
        "99999999-9999-4999-8999-999999999999",
      ),
    ).toThrow(/scope mismatch/);
  });

  it("drops malformed contexts instead of inventing delegation authority", () => {
    const projection = parseV3NextInLineProjection({
      editionId: "11111111-1111-4111-8111-111111111111",
      state: "open",
      contexts: [
        { country: { name: "Missing id" }, sourceSubmissionId: "source" },
        "browser supplied country",
      ],
      serverTime: "2026-10-16T12:06:00Z",
    });
    expect(projection.contexts).toEqual([]);
  });
});

describe("V3 Next in Line receipt", () => {
  it("requires canonical operation and submission evidence", () => {
    expect(
      parseV3NextInLineReceipt({
        ok: true,
        submission_id: "55555555-5555-4555-8555-555555555555",
        edition_id: "11111111-1111-4111-8111-111111111111",
        source_submission_id: "33333333-3333-4333-8333-333333333333",
        country_id: "22222222-2222-4222-8222-222222222222",
        revision: 2,
        submitted_at: "2026-10-16T12:00:00Z",
        updatedAt: "2026-10-16T12:05:00Z",
        operationId: "66666666-6666-4666-8666-666666666666",
        receiptId: "66666666-6666-4666-8666-666666666666",
        replayed: true,
        unchanged: false,
      }),
    ).toMatchObject({
      ok: true,
      revision: 2,
      replayed: true,
      operationId: "66666666-6666-4666-8666-666666666666",
    });

    expect(() => parseV3NextInLineReceipt({ ok: true })).toThrow(/receipt unavailable/);
  });
});
