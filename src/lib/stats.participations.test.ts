import { describe, expect, it } from "vitest";

import { computeCountryStats } from "./stats";

const countryId = "country-a";

const editions = [
  { id: "edition-1", edition_number: 1, name: "SSC 1" },
  { id: "edition-2", edition_number: 2, name: "SSC 2" },
] as any[];

const shows = [
  { id: "semi-1", edition_id: "edition-1", kind: "semi-final" },
  { id: "final-1", edition_id: "edition-1", kind: "grand-final" },
  { id: "semi-2", edition_id: "edition-2", kind: "semi-final" },
] as any[];

function participant(id: string, editionId: string, showId: string, qualified: boolean | null) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    artist: "Same Artist",
    song: "Same Song",
    running_order: 1,
    semi_final: "semi-final",
    qualified,
    notes: null,
  } as any;
}

function result(id: string, editionId: string, showId: string, rank: number, total: number) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    jury_points: Math.floor(total / 2),
    televote_points: total - Math.floor(total / 2),
    total_points: total,
    final_rank: rank,
  } as any;
}

describe("canonical edition participations", () => {
  it("counts a semi-final and grand-final appearance as one participation", () => {
    const stats = computeCountryStats(countryId, {
      editions: [editions[0]],
      shows: shows.slice(0, 2),
      participants: [
        participant("semi-row", "edition-1", "semi-1", true),
        participant("final-row", "edition-1", "final-1", null),
      ],
      results: [
        result("semi-result", "edition-1", "semi-1", 5, 100),
        result("final-result", "edition-1", "final-1", 8, 150),
      ],
      jury: [],
      televote: [],
    });

    expect(stats.participations).toBe(1);
    expect(stats.finals).toBe(1);
    expect(stats.semis).toBe(1);
    expect(stats.timeline).toHaveLength(1);
    expect(stats.timeline[0]?.editionId).toBe("edition-1");
  });

  it("counts the same delegation in a different edition as another participation", () => {
    const stats = computeCountryStats(countryId, {
      editions,
      shows,
      participants: [
        participant("semi-row", "edition-1", "semi-1", true),
        participant("final-row", "edition-1", "final-1", null),
        participant("next-edition-row", "edition-2", "semi-2", false),
      ],
      results: [
        result("semi-result", "edition-1", "semi-1", 5, 100),
        result("final-result", "edition-1", "final-1", 8, 150),
        result("next-edition-result", "edition-2", "semi-2", 12, 70),
      ],
      jury: [],
      televote: [],
    });

    expect(stats.participations).toBe(2);
    expect(stats.timeline).toHaveLength(2);
  });

  it("uses the same rule for a custom edition entity identity", () => {
    const customIdentity = "custom-entity";
    const stats = computeCountryStats(customIdentity, {
      editions: [editions[0]],
      shows: shows.slice(0, 2),
      participants: [
        { ...participant("custom-semi", "edition-1", "semi-1", true), country_id: customIdentity, contest_entity_id: customIdentity },
        { ...participant("custom-final", "edition-1", "final-1", null), country_id: customIdentity, contest_entity_id: customIdentity },
      ],
      results: [
        { ...result("custom-semi-result", "edition-1", "semi-1", 4, 110), country_id: customIdentity },
        { ...result("custom-final-result", "edition-1", "final-1", 6, 170), country_id: customIdentity },
      ],
      jury: [],
      televote: [],
    });

    expect(stats.participations).toBe(1);
    expect(stats.finals).toBe(1);
  });
});
