import { describe, expect, it } from "vitest";

import { computeCanonicalCountryStats } from "./canonical-country-stats";

function edition(number: number) {
  return {
    id: `ssc${number}`,
    edition_number: number,
    name: `SSC ${number}`,
    year: 2020 + number,
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

function show(id: string, editionId: string, kind: string, order: number) {
  return {
    id,
    edition_id: editionId,
    name: id.replaceAll("-", " "),
    kind,
    sort_order: order,
    published: true,
    status: "done",
    qualifier_count: kind === "semi-final" ? 10 : null,
    theme_id: null,
    voting_config: kind === "semi-final" ? { qualifiers: 10 } : {},
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

function participant(id: string, editionId: string, showId: string, qualified: boolean | null) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: "a",
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

function result(id: string, editionId: string, showId: string, total: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: "a",
    contest_entity_id: null,
    jury_points: Math.floor(total / 2),
    televote_points: total - Math.floor(total / 2),
    total_points: total,
    final_rank: 1,
  } as any;
}

describe("direct-final qualification streaks", () => {
  it("keeps a streak alive through an edition that had only a final", () => {
    const editions = [edition(1), edition(2), edition(3)];
    const shows = [
      show("ssc1-semi", "ssc1", "semi-final", 1),
      show("ssc1-final", "ssc1", "grand-final", 2),
      show("ssc2-final", "ssc2", "grand-final", 1),
      show("ssc3-semi", "ssc3", "semi-final", 1),
      show("ssc3-final", "ssc3", "grand-final", 2),
    ];
    const participants = [
      participant("ssc1-semi-p", "ssc1", "ssc1-semi", true),
      participant("ssc1-final-p", "ssc1", "ssc1-final", null),
      participant("ssc2-final-p", "ssc2", "ssc2-final", null),
      participant("ssc3-semi-p", "ssc3", "ssc3-semi", true),
      participant("ssc3-final-p", "ssc3", "ssc3-final", null),
    ];
    const results = [
      result("ssc1-final-r", "ssc1", "ssc1-final", 100),
      result("ssc2-final-r", "ssc2", "ssc2-final", 110),
      result("ssc3-final-r", "ssc3", "ssc3-final", 120),
    ];

    const stats = computeCanonicalCountryStats("a", {
      editions,
      shows,
      participants,
      results,
      jury: [],
      televote: [],
    });

    // SSC2 had no qualification round, so it is not counted as a literal Q.
    expect(stats.qualifications).toBe(2);
    expect(stats.qualificationPct).toBe(100);
    expect(stats.timeline.find((point) => point.editionNumber === 2)?.qualified).toBeNull();

    // But reaching the only stage available in SSC2 must not break the streak.
    expect(stats.consecutiveQualifications).toBe(3);
    expect(stats.consecutiveFinals).toBe(3);
  });
});
