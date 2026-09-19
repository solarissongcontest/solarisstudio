import { describe, expect, it } from "vitest";

import type { CountryConfirmationResponse } from "./confirmation-country-account";
import type { PublicRound } from "./confirmation-rounds.functions";
import {
  buildPersonalAttentionItems,
  homepagePersonalAttention,
} from "./personal-attention";

const round: PublicRound = {
  id: "round-22",
  name: "SSC 22 confirmations",
  status: "open",
  opens_at: "2026-09-01T00:00:00Z",
  closes_at: "2026-09-30T18:00:00Z",
  response_limit: null,
  response_count: 0,
  edition_id: "edition-22",
  edition_name: "SSC 22",
  edition_number: 22,
};

function response(
  patch: Partial<CountryConfirmationResponse> = {},
): CountryConfirmationResponse {
  return {
    submission_id: "submission-1",
    round_id: "round-22",
    round_name: "SSC 22 confirmations",
    edition_id: "edition-22",
    edition_name: "SSC 22",
    edition_number: 22,
    country: "Oland",
    submitted_at: "2026-09-10T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    selection_method: "internal",
    internal_entry: {
      artist: "Artist",
      song_title: "Song",
      review_status: "pending",
    },
    can_edit: true,
    reason: "open",
    ...patch,
  };
}

describe("personal attention resolver", () => {
  it("creates a submission task only while the relevant round is actually open", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [],
      rounds: [round],
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(items.map((item) => item.id)).toContain("confirmation-missing:round-22");
    expect(items[0]?.actionRequired).toBe(true);
  });

  it("does not invent a missing-entry task when the country already submitted", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [response()],
      rounds: [round],
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(items).toEqual([]);
  });

  it("does not interrupt users while an entry is merely waiting for review", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [response({
        internal_entry: {
          artist: "Artist",
          song_title: "Song",
          review_status: "pending",
        },
      })],
      rounds: [round],
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(homepagePersonalAttention(items)).toEqual([]);
  });

  it("surfaces a declined entry with the real organizer reason", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [response({
        internal_entry: {
          artist: "Artist",
          song_title: "Song",
          review_status: "declined",
          review_reason: "Replace the submitted performance link.",
        },
      })],
      rounds: [round],
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "entry-declined:submission-1",
      title: "Your entry needs changes",
      description: "Replace the submitted performance link.",
      severity: "critical",
      actionRequired: true,
    });
  });

  it("keeps accepted submissions and fully clear accounts silent", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [response({
        internal_entry: {
          artist: "Artist",
          song_title: "Song",
          review_status: "accepted",
        },
      })],
      rounds: [round],
      acknowledgementTasks: 0,
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(items).toEqual([]);
    expect(homepagePersonalAttention(items)).toEqual([]);
  });

  it("surfaces required acknowledgements without surfacing ordinary unread notices", () => {
    const items = buildPersonalAttentionItems({
      editionId: "edition-22",
      responses: [response()],
      rounds: [round],
      acknowledgementTasks: 2,
      now: new Date("2026-09-19T12:00:00Z").getTime(),
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: "required-notices",
        actionRequired: true,
      }),
    ]);
  });
});
