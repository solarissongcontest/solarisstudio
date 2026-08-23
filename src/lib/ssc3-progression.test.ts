import { describe, expect, it } from "vitest";

import { computeCanonicalCountryStats } from "./canonical-country-stats";
import { buildEditionProgressionPlacements } from "./edition-progression";

const edition = {
  id: "ssc3",
  edition_number: 3,
  name: "SSC 3",
  year: 2023,
  slug: "ssc-3",
  description: null,
  host_country_id: null,
  host_city: null,
  logo: null,
  theme_id: null,
  status: "completed",
  published: true,
} as any;

function show(id: string, kind: string, sortOrder: number, qualifiers: number | null = null) {
  return {
    id,
    edition_id: "ssc3",
    name: id.replaceAll("-", " "),
    kind,
    sort_order: sortOrder,
    published: true,
    status: "done",
    qualifier_count: qualifiers,
    theme_id: null,
    voting_config: qualifiers == null ? {} : { qualifiers },
    broadcast_config: {},
    publication_config: {
      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
      qualifiers: true,
      results: true,
      jury_results: true,
      televote_results: true,
      detailed_voting: true,
    },
  } as any;
}

const shows = [
  show("heat-1", "heat", 1, 3),
  show("heat-2", "heat", 2, 3),
  show("second-chance", "second-chance", 3, 1),
  show("semi-1", "semi-final", 4, 2),
  show("semi-2", "semi-final", 5, 2),
  show("grand-final", "grand-final", 6),
];

function result(id: string, showId: string, countryId: string, rank: number, total: number) {
  return {
    id,
    edition_id: "ssc3",
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    jury_points: Math.floor(total / 2),
    televote_points: total - Math.floor(total / 2),
    total_points: total,
    final_rank: rank,
  } as any;
}

const results = [
  result("a-final", "grand-final", "a", 1, 200),
  result("b-final", "grand-final", "b", 2, 180),
  result("c-semi", "semi-1", "c", 3, 100),
  result("d-semi", "semi-2", "d", 3, 90),
  // G lost its heat, qualified from Second Chance, then NQed in the semi.
  result("g-heat", "heat-1", "g", 7, 60),
  result("g-semi", "semi-1", "g", 4, 85),
  // These countries never reached a semi-final.
  result("e-heat", "heat-1", "e", 8, 80),
  result("f-heat", "heat-2", "f", 8, 70),
  result("h-heat", "heat-2", "h", 9, 55),
];

function participant(id: string, showId: string, countryId: string, qualified: boolean | null) {
  return {
    id,
    edition_id: "ssc3",
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    artist: "Artist",
    song: "Song",
    running_order: 1,
    semi_final: "",
    qualified,
    notes: null,
    publication_status: "published",
    participation_status: "confirmed",
  } as any;
}

describe("SSC3 multi-stage progression", () => {
  it("builds one combined top as final, semi-final NQs, then heat NQs", () => {
    const placements = buildEditionProgressionPlacements(results, shows).get("ssc3")!;

    expect(placements.get("a")?.rank).toBe(1);
    expect(placements.get("b")?.rank).toBe(2);
    expect(placements.get("c")?.rank).toBe(3);
    expect(placements.get("d")?.rank).toBe(4);
    expect(placements.get("g")?.rank).toBe(5);
    expect(placements.get("e")?.rank).toBe(6);
    expect(placements.get("f")?.rank).toBe(7);
    expect(placements.get("h")?.rank).toBe(8);

    expect(placements.get("g")?.source).toBe("semi");
    expect(placements.get("g")?.row.id).toBe("g-semi");
    expect(placements.get("e")?.source).toBe("heat");
  });

  it("does not require or invent a Second Chance result ranking", () => {
    expect(results.some((row) => row.show_id === "second-chance")).toBe(false);
    const placements = buildEditionProgressionPlacements(results, shows).get("ssc3")!;
    expect(placements.get("g")?.rank).toBe(5);
    expect(placements.get("h")?.rank).toBe(8);
  });

  it("keeps a heat NQ in country history instead of dropping the edition", () => {
    const participants = [
      participant("e-heat-p", "heat-1", "e", false),
      participant("h-heat-p", "heat-2", "h", false),
      participant("h-sc-p", "second-chance", "h", false),
      participant("g-heat-p", "heat-1", "g", false),
      participant("g-sc-p", "second-chance", "g", true),
      participant("g-semi-p", "semi-1", "g", false),
    ];

    const eStats = computeCanonicalCountryStats("e", {
      editions: [edition],
      shows,
      participants,
      results,
      jury: [],
      televote: [],
    });
    const gStats = computeCanonicalCountryStats("g", {
      editions: [edition],
      shows,
      participants,
      results,
      jury: [],
      televote: [],
    });

    expect(eStats.participations).toBe(1);
    expect(eStats.timeline).toHaveLength(1);
    expect(eStats.timeline[0]?.rank).toBe(6);
    expect(eStats.timeline[0]?.qualified).toBe(false);
    expect(eStats.qualificationPct).toBe(0);

    expect(gStats.semis).toBe(1);
    expect(gStats.timeline[0]?.rank).toBe(5);
    expect(gStats.timeline[0]?.total).toBe(85);
    expect(gStats.timeline[0]?.qualified).toBe(false);
  });
});
