import { describe, expect, it } from "vitest";

import { parseV3PersonalHistory } from "./v3-personal-history";

const VIEWER_ID = "11111111-1111-4111-8111-111111111111";
const EDITION_ID = "22222222-2222-4222-8222-222222222222";
const COUNTRY_ID = "33333333-3333-4333-8333-333333333333";

function projection(role = "hod") {
  return {
    viewer_id: VIEWER_ID,
    items: [{
      id: `hod:${EDITION_ID}:${COUNTRY_ID}`,
      edition_id: EDITION_ID,
      edition_number: 22,
      edition_name: "Solaris Song Contest 22",
      country_id: COUNTRY_ID,
      country_code: "OLA",
      country_name: "Oland",
      role,
      started_at: null,
      ended_at: null,
      source: "hod_claim",
      state: "historical",
    }],
    generated_at: "2026-10-23T18:30:00Z",
  };
}

describe("V3 personal participation history", () => {
  it("parses caller-scoped historical identity", () => {
    const parsed = parseV3PersonalHistory(projection());

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.viewerId).toBe(VIEWER_ID);
    expect(parsed.items[0]).toMatchObject({
      editionId: EDITION_ID,
      countryId: COUNTRY_ID,
      countryName: "Oland",
      role: "hod",
      state: "historical",
    });
  });

  it("generalizes future/internal role labels rather than exposing them as authority", () => {
    const parsed = parseV3PersonalHistory(projection("internal-special-role"));
    expect(parsed.items[0]?.role).toBe("other");
  });

  it("fails closed on malformed projection identity", () => {
    const malformed = projection();
    malformed.viewer_id = "not-a-user-id";

    expect(parseV3PersonalHistory(malformed)).toEqual({
      schemaReady: false,
      viewerId: null,
      items: [],
      generatedAt: null,
    });
  });

  it("fails closed if a history row lacks canonical edition identity", () => {
    const malformed = projection();
    malformed.items[0].edition_id = "SSC 22";
    expect(parseV3PersonalHistory(malformed).schemaReady).toBe(false);
  });
});
