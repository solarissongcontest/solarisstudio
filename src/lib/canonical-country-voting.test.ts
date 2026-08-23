import { describe, expect, it } from "vitest";

import { computeCanonicalCountryStats } from "./canonical-country-stats";

const countryId = "country-a";

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
    qualifier_count: 1,
    theme_id: null,
    voting_config: { juryPoints: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] },
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

function participant(id: string, editionId: string, showId: string) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    artist: "Artist",
    song: "Song",
    running_order: 1,
    semi_final: "",
    qualified: true,
    notes: null,
    publication_status: "published",
    scheduled_publish_at: null,
  } as any;
}

function result(id: string, editionId: string, showId: string, total: number, rank: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    jury_points: total,
    televote_points: 0,
    total_points: total,
    final_rank: rank,
  } as any;
}

function juryVote(
  id: string,
  editionId: string,
  showId: string,
  voterCountryId: string | null,
  receivingCountryId: string,
  points: number,
  voterId?: string,
) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    voter_country_id: voterCountryId,
    voter_id: voterId ?? null,
    voter_entity_id: null,
    receiving_country_id: receivingCountryId,
    receiving_entity_id: null,
    points,
  } as any;
}

describe("canonical country voting statistics", () => {
  it("averages points given per edition rather than treating semi and final as separate contests", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi", "e1", "semi-final");
    const final = show("final", "e1", "grand-final");
    const stats = computeCanonicalCountryStats(countryId, {
      editions: [e1],
      shows: [semi, final],
      participants: [participant("p-semi", "e1", "semi"), participant("p-final", "e1", "final")],
      results: [result("r-semi", "e1", "semi", 80, 1), result("r-final", "e1", "final", 100, 2)],
      jury: [
        juryVote("give-semi", "e1", "semi", countryId, "other-a", 10),
        juryVote("give-final", "e1", "final", countryId, "other-b", 12),
      ],
      televote: [],
    });

    expect(stats.avgGivenPerContest).toBe(22);
  });

  it("counts top scores received from country and external voters", () => {
    const e1 = edition("e1", 1);
    const final = show("final", "e1", "grand-final");
    const stats = computeCanonicalCountryStats(countryId, {
      editions: [e1],
      shows: [final],
      participants: [participant("p-final", "e1", "final")],
      results: [result("r-final", "e1", "final", 24, 1)],
      jury: [
        juryVote("country-vote", "e1", "final", "country-b", countryId, 12),
        juryVote("external-vote", "e1", "final", null, countryId, 12, "external-voter"),
      ],
      televote: [],
    });

    expect(stats.topScoresReceived).toBe(2);
  });
});
