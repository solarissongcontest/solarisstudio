import { describe, expect, it } from "vitest";

import {
  emptyV3ParticipationHistoryBundle,
  parseV3ParticipationHistory,
} from "./v3-participation-history";

describe("V3 participation history projection", () => {
  it("parses recipient-safe edition, country, role and reconciliation evidence", () => {
    const parsed = parseV3ParticipationHistory({
      viewer_id: "viewer-1",
      items: [
        {
          id: "history-1",
          edition_id: "edition-22",
          edition_number: 22,
          edition_name: "Solaris 22",
          country_id: "country-1",
          country_code: "SOL",
          country_name: "Solaria",
          role: "hod",
          started_at: "2026-01-01T00:00:00Z",
          ended_at: null,
          source: "delegation_membership",
          state: "current",
        },
        {
          id: "history-2",
          edition_id: "edition-21",
          edition_number: 21,
          edition_name: "Solaris 21",
          country_id: "country-2",
          country_name: "Northstar",
          role: "internal_admin_capability",
          source: "reconciled_membership",
          state: "superseded",
        },
      ],
      generated_at: "2026-10-16T18:00:00Z",
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.viewerId).toBe("viewer-1");
    expect(parsed.items[0]).toMatchObject({
      editionNumber: 22,
      countryName: "Solaria",
      role: "hod",
      state: "current",
    });
    expect(parsed.items[1]).toMatchObject({
      role: "other",
      state: "superseded",
    });
  });

  it("drops malformed rows and never invents required history identity", () => {
    const parsed = parseV3ParticipationHistory({
      viewer_id: "viewer-1",
      items: [
        null,
        { id: "missing-edition" },
        { id: "missing-source", edition_id: "e", edition_name: "SSC" },
      ],
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.items).toEqual([]);
  });

  it("fails closed when the canonical System payload is absent", () => {
    expect(parseV3ParticipationHistory(null)).toEqual(emptyV3ParticipationHistoryBundle());
  });
});
