import { describe, expect, it } from "vitest";

import type { Country, Edition, JuryVote, Participant, ResultRow, Show } from "./data";
import { buildAnniversaryArchiveInsights } from "./anniversary-insights";

const countries: Country[] = [
  { id: "a", name: "Alpha", native_name: null, short_code: "ALP", flag_image: null, region: "Atlas", accent_color: "#fff", description: null, first_participation: 1 },
  { id: "b", name: "Beta", native_name: null, short_code: "BET", flag_image: null, region: "Atlas", accent_color: "#fff", description: null, first_participation: 1 },
  { id: "c", name: "Gamma", native_name: null, short_code: "GAM", flag_image: null, region: "Atlas", accent_color: "#fff", description: null, first_participation: 1 },
];

const editions: Edition[] = [
  { id: "e1", edition_number: 1, name: "SSC 1", year: 2022, slug: "ssc-1", description: null, host_country_id: "a", host_city: "A City", logo: null, theme_id: null, status: "completed", published: true },
  { id: "e2", edition_number: 2, name: "SSC 2", year: 2023, slug: "ssc-2", description: null, host_country_id: "b", host_city: "B City", logo: null, theme_id: null, status: "completed", published: true },
];

const shows: Show[] = [
  { id: "s1", edition_id: "e1", name: "Grand Final", kind: "grand-final", sort_order: 1, published: true, status: "completed", qualifier_count: null, theme_id: null, voting_config: null, broadcast_config: null, publication_config: null },
  { id: "s2", edition_id: "e2", name: "Grand Final", kind: "grand-final", sort_order: 1, published: true, status: "completed", qualifier_count: null, theme_id: null, voting_config: null, broadcast_config: null, publication_config: null },
];

const participants: Participant[] = [
  ...["a", "b", "c"].map((countryId, index) => ({ id: `p1-${countryId}`, edition_id: "e1", show_id: null, country_id: countryId, contest_entity_id: null, artist: null, song: null, running_order: index + 1, semi_final: "", qualified: true, notes: null })),
  ...["a", "b", "c"].map((countryId, index) => ({ id: `p2-${countryId}`, edition_id: "e2", show_id: null, country_id: countryId, contest_entity_id: null, artist: null, song: null, running_order: index + 1, semi_final: "", qualified: true, notes: null })),
];

const results: ResultRow[] = [
  { id: "r1a", edition_id: "e1", show_id: "s1", country_id: "a", jury_points: 60, televote_points: 40, total_points: 100, final_rank: 1 },
  { id: "r1b", edition_id: "e1", show_id: "s1", country_id: "b", jury_points: 45, televote_points: 45, total_points: 90, final_rank: 2 },
  { id: "r1c", edition_id: "e1", show_id: "s1", country_id: "c", jury_points: 20, televote_points: 30, total_points: 50, final_rank: 3 },
  { id: "r2b", edition_id: "e2", show_id: "s2", country_id: "b", jury_points: 55, televote_points: 65, total_points: 120, final_rank: 1 },
  { id: "r2a", edition_id: "e2", show_id: "s2", country_id: "a", jury_points: 80, televote_points: 39, total_points: 119, final_rank: 2 },
  { id: "r2c", edition_id: "e2", show_id: "s2", country_id: "c", jury_points: 20, televote_points: 60, total_points: 80, final_rank: 3 },
];

const juryVotes: JuryVote[] = [
  { id: "j1", edition_id: "e1", show_id: "s1", voter_country_id: "a", receiving_country_id: "b", points: 12 },
  { id: "j2", edition_id: "e1", show_id: "s1", voter_country_id: "b", receiving_country_id: "a", points: 10 },
  { id: "j3", edition_id: "e2", show_id: "s2", voter_country_id: "a", receiving_country_id: "b", points: 10 },
  { id: "j4", edition_id: "e2", show_id: "s2", voter_country_id: "b", receiving_country_id: "a", points: 12 },
];

describe("anniversary archive insights", () => {
  const insights = buildAnniversaryArchiveInsights({
    anniversaryYear: 2023,
    editions,
    shows,
    participants,
    results,
    countries,
    juryVotes,
  });

  it("builds country history from published editions and finals", () => {
    const alpha = insights.countries.find((country) => country.countryId === "a");
    expect(alpha).toMatchObject({
      participations: 2,
      finals: 2,
      wins: 1,
      bestRank: 1,
      debutEdition: 1,
      latestEdition: 2,
      activeStreak: 2,
      participationShare: 100,
      totalFinalPoints: 219,
    });
  });

  it("finds the tightest final and highest winning score", () => {
    expect(insights.moments.find((moment) => moment.id === "closest-final")?.editionNumber).toBe(2);
    expect(insights.moments.find((moment) => moment.id === "highest-score")?.title).toContain("120");
    expect(insights.editions.find((edition) => edition.editionNumber === 2)?.winningMargin).toBe(1);
  });

  it("builds annual comparisons", () => {
    expect(insights.eras).toHaveLength(2);
    expect(insights.eras[0]).toMatchObject({ year: 2022, editions: 1, averageFieldSize: 3, uniqueWinners: 1 });
    expect(insights.eras[1]).toMatchObject({ year: 2023, editions: 1, averageFieldSize: 3, uniqueWinners: 1 });
  });

  it("aggregates mutual jury relationships without claiming intent", () => {
    expect(insights.strongestMutualRelationship).toMatchObject({
      aId: "a",
      bId: "b",
      aToB: 22,
      bToA: 22,
      mutualScore: 22,
    });
  });

  it("finds the largest jury-televote point split", () => {
    expect(insights.biggestJuryTelevoteSplit).toMatchObject({
      countryId: "a",
      editionNumber: 2,
      juryPoints: 80,
      televotePoints: 39,
      gap: 41,
    });
  });
});
