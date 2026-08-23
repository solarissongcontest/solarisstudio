import { describe, expect, it } from "vitest";

import { buildCanonicalFanRecords } from "./canonical-fan-records";
import { computeCanonicalCountryStats } from "./canonical-country-stats";
import {
  qualificationCountsAsQualified,
  qualificationLabel,
  resolveCountryEditionQualification,
} from "./qualification";

const country = {
  id: "a",
  name: "Aland",
  native_name: null,
  short_code: "ALA",
  flag_image: null,
  region: "North",
  accent_color: "#123456",
  description: null,
  first_participation: null,
} as any;

function edition(id: string, number: number) {
  return {
    id,
    edition_number: number,
    name: `SSC ${number}`,
    year: 2026,
    slug: `ssc-${number}`,
    description: null,
    host_country_id: null,
    host_city: null,
    logo: null,
    theme_id: null,
    status: "completed",
    published: true,
  } as any;
}

function show(id: string, editionId: string, kind: string) {
  return {
    id,
    edition_id: editionId,
    name: id,
    kind,
    sort_order: 1,
    published: true,
    status: "done",
    qualifier_count: 2,
    theme_id: null,
    voting_config: { qualifiers: 2 },
    broadcast_config: {},
    // Legacy published shows resolve to the results preset, including qualifiers.
    publication_config: null,
  } as any;
}

function participant(
  id: string,
  editionId: string,
  showId: string | null,
  qualified: boolean | null,
) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: "a",
    contest_entity_id: null,
    artist: `Artist ${editionId}`,
    song: `Song ${editionId}`,
    running_order: 1,
    semi_final: showId?.startsWith("semi") ? "semi-final" : "",
    qualified,
    notes: null,
    publication_status: "published",
  } as any;
}

function result(id: string, editionId: string, showId: string, rank: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: "a",
    jury_points: 50,
    televote_points: 50,
    total_points: 100,
    final_rank: rank,
  } as any;
}

describe("qualification routes", () => {
  it("labels a semi-final NQ that still reaches the final as Wildcard", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");
    const status = resolveCountryEditionQualification("a", "e1", {
      shows: [semi, final],
      participants: [
        participant("semi-row", "e1", "semi-1", false),
        participant("final-row", "e1", "final-1", false),
      ],
      results: [result("semi-result", "e1", "semi-1", 5), result("final-result", "e1", "final-1", 8)],
    });

    expect(status).toBe("wildcard");
    expect(qualificationLabel(status)).toBe("Wildcard");
    expect(qualificationCountsAsQualified(status)).toBe(true);
    expect(e1.edition_number).toBe(1);
  });

  it("labels a direct finalist in a semi-final edition as AQ", () => {
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");
    const status = resolveCountryEditionQualification("a", "e1", {
      shows: [semi, final],
      participants: [participant("final-row", "e1", "final-1", null)],
      results: [result("final-result", "e1", "final-1", 4)],
    });

    expect(status).toBe("aq");
    expect(qualificationCountsAsQualified(status)).toBe(true);
  });

  it("counts Q, AQ and Wildcard as one continuous qualification history", () => {
    const editions = [1, 2, 3, 4, 5].map((number) => edition(`e${number}`, number));
    const shows = editions.flatMap((item) => [
      show(`semi-${item.edition_number}`, item.id, "semi-final"),
      show(`final-${item.edition_number}`, item.id, "grand-final"),
    ]);
    const participants = [
      participant("e1-semi", "e1", "semi-1", true),
      participant("e1-final", "e1", "final-1", true),
      participant("e2-final", "e2", "final-2", null),
      participant("e3-semi", "e3", "semi-3", true),
      participant("e3-final", "e3", "final-3", true),
      participant("e4-semi", "e4", "semi-4", false),
      participant("e4-final", "e4", "final-4", false),
      participant("e5-semi", "e5", "semi-5", false),
    ];
    const results = [
      result("e1-semi-r", "e1", "semi-1", 1),
      result("e1-final-r", "e1", "final-1", 5),
      result("e2-final-r", "e2", "final-2", 6),
      result("e3-semi-r", "e3", "semi-3", 2),
      result("e3-final-r", "e3", "final-3", 4),
      result("e4-semi-r", "e4", "semi-4", 5),
      result("e4-final-r", "e4", "final-4", 10),
      result("e5-semi-r", "e5", "semi-5", 6),
    ];

    const stats = computeCanonicalCountryStats("a", {
      editions,
      shows,
      participants,
      results,
      jury: [],
      televote: [],
    });
    expect(stats.qualifications).toBe(4);
    expect(stats.qualificationPct).toBe(80);

    const records = buildCanonicalFanRecords({
      countries: [country],
      editions,
      shows,
      participants,
      results,
      jury: [],
    });
    expect(records.find((record) => record.id === "qualification-streak")?.value).toBe("4 editions");
  });
});
