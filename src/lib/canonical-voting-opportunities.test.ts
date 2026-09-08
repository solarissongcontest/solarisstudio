import { describe, expect, it } from "vitest";

import { computeCanonicalCountryStats } from "./canonical-country-stats";

function edition(id: string, number: number) {
  return {
    id,
    edition_number: number,
    name: `SSC ${number}`,
    year: 2026,
    slug: `ssc-${number}`,
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
    voting_config: { qualifiers: 1 },
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

function participant(id: string, countryId: string, editionId: string, showId: string, qualified: boolean | null) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    artist: "Artist",
    song: "Song",
    running_order: 1,
    semi_final: showId.startsWith("semi") ? "semi-final" : "",
    qualified,
    publication_status: "published",
  } as any;
}

function result(id: string, countryId: string, editionId: string, showId: string, rank: number, points: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    jury_points: Math.floor(points / 2),
    televote_points: points - Math.floor(points / 2),
    total_points: points,
    final_rank: rank,
  } as any;
}

function vote(id: string, editionId: string, showId: string, voter: string, receiver: string, points: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    voter_country_id: voter,
    receiving_country_id: receiver,
    points,
  } as any;
}

describe("canonical country voting opportunities", () => {
  it("averages jury points given and received by edition, separately from result score", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");
    const participants = [
      participant("a-semi", "a", "e1", "semi-1", true),
      participant("a-final", "a", "e1", "final-1", true),
      participant("b-semi", "b", "e1", "semi-1", true),
      participant("b-final", "b", "e1", "final-1", true),
      participant("c-semi", "c", "e1", "semi-1", false),
    ];
    const results = [
      result("a-semi-r", "a", "e1", "semi-1", 1, 50),
      result("a-final-r", "a", "e1", "final-1", 2, 100),
      result("b-semi-r", "b", "e1", "semi-1", 2, 40),
      result("b-final-r", "b", "e1", "final-1", 1, 110),
      result("c-semi-r", "c", "e1", "semi-1", 3, 30),
    ];
    const jury = [
      vote("a-b-semi", "e1", "semi-1", "a", "b", 10),
      vote("a-b-final", "e1", "final-1", "a", "b", 12),
      vote("b-a-semi", "e1", "semi-1", "b", "a", 8),
      vote("b-a-final", "e1", "final-1", "b", "a", 12),
      vote("c-b-semi", "e1", "semi-1", "c", "b", 6),
    ];

    const stats = computeCanonicalCountryStats("a", {
      editions: [e1],
      shows: [semi, final],
      participants,
      results,
      jury,
      televote: [],
    });

    expect(stats.avgGivenPerContest).toBe(22);
    expect(stats.avgReceivedPerContest).toBe(20);
    expect(stats.avgPointsPerParticipation).toBe(100);
  });

  it("includes eligible zero-point voters and recipients in opportunity metrics", () => {
    const e1 = edition("e1", 1);
    const final = show("final-1", "e1", "grand-final");
    const participants = [
      participant("a", "a", "e1", "final-1", null),
      participant("b", "b", "e1", "final-1", null),
      participant("c", "c", "e1", "final-1", null),
    ];
    const results = [
      result("a-r", "a", "e1", "final-1", 1, 100),
      result("b-r", "b", "e1", "final-1", 2, 90),
      result("c-r", "c", "e1", "final-1", 3, 80),
    ];
    const jury = [
      vote("a-b", "e1", "final-1", "a", "b", 12),
      vote("b-a", "e1", "final-1", "b", "a", 10),
      vote("c-b", "e1", "final-1", "c", "b", 8),
    ];

    const stats = computeCanonicalCountryStats("a", {
      editions: [e1],
      shows: [final],
      participants,
      results,
      jury,
      televote: [],
    });

    expect(stats.avgPointsPerVoter).toBe(5);
    expect(stats.neverAwarded).toContain("c");
    expect(stats.neverVotedForThem).toContain("c");
    expect(stats.harshestTowards).toEqual({ countryId: "c", points: 0 });
  });
});
