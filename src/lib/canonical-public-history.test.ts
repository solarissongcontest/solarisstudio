import { describe, expect, it } from "vitest";

import { buildAnniversaryRecap } from "./anniversary";
import { computeCanonicalCountryStats } from "./canonical-country-stats";
import { collapseFanRecordHolders } from "./canonical-fan-records";
import { computeCanonicalHeadToHead } from "./canonical-head-to-head";
import { canonicalEditionEntries } from "./entry-utils";

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
    qualifier_count: null,
    theme_id: null,
    voting_config: {},
    broadcast_config: {},
    publication_config: null,
  } as any;
}

function participant(
  id: string,
  editionId: string,
  showId: string | null,
  qualified: boolean | null = null,
  countryId = "a",
) {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    artist: `Artist ${editionId}`,
    song: `Song ${editionId}`,
    running_order: 1,
    semi_final: showId?.startsWith("semi") ? "semi-final" : "",
    qualified,
    notes: null,
    youtube_url: null,
    spotify_url: null,
    apple_music_url: null,
  } as any;
}

function result(
  id: string,
  editionId: string,
  showId: string,
  rank: number,
  total: number,
  countryId = "a",
) {
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

describe("canonical public history", () => {
  it("keeps one canonical entry per country per edition even when several editions are passed together", () => {
    const rows = [
      participant("e1-semi", "e1", "semi-1", true),
      participant("e1-final", "e1", "final-1"),
      participant("e1-canonical", "e1", null),
      participant("e2-semi", "e2", "semi-2", false),
      participant("e2-canonical", "e2", null),
    ];

    const canonical = canonicalEditionEntries(rows);
    expect(canonical).toHaveLength(2);
    expect(canonical.map((entry) => entry.edition_id).sort()).toEqual(["e1", "e2"]);
    expect(canonical.find((entry) => entry.edition_id === "e1")?.id).toBe("e1-canonical");
  });

  it("counts an anniversary entry once when semi, final and canonical rows all exist", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");

    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [e1],
      shows: [semi, final],
      participants: [
        participant("semi-row", "e1", "semi-1", true),
        participant("final-row", "e1", "final-1"),
        participant("canonical-row", "e1", null),
      ],
      results: [result("final-result", "e1", "final-1", 1, 100)],
      countries: [country],
    });

    expect(recap.entryCount).toBe(1);
    expect(recap.countryCount).toBe(1);
  });

  it("uses unique edition participations for final appearance rate and edition score averages", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");

    const stats = computeCanonicalCountryStats("a", {
      editions: [e1],
      shows: [semi, final],
      participants: [
        participant("semi-row", "e1", "semi-1", true),
        participant("final-row", "e1", "final-1"),
        participant("canonical-row", "e1", null),
      ],
      results: [
        result("semi-result", "e1", "semi-1", 4, 70),
        result("final-result", "e1", "final-1", 2, 150),
      ],
      jury: [],
      televote: [],
    });

    expect(stats.participations).toBe(1);
    expect(stats.finals).toBe(1);
    expect(stats.semis).toBe(1);
    expect(stats.grandFinalAppearancePct).toBe(100);
    expect(stats.avgPointsPerParticipation).toBe(150);
    expect(stats.highestScore).toBe(150);
    expect(stats.lowestScore).toBe(150);
  });

  it("does not join qualification streaks across skipped edition numbers", () => {
    const e1 = edition("e1", 1);
    const e2 = edition("e2", 2);
    const e3 = edition("e3", 3);
    const semi1 = show("semi-1", "e1", "semi-final");
    const semi3 = show("semi-3", "e3", "semi-final");

    const stats = computeCanonicalCountryStats("a", {
      editions: [e1, e2, e3],
      shows: [semi1, semi3],
      participants: [
        participant("e1", "e1", "semi-1", true),
        participant("e3", "e3", "semi-3", true),
      ],
      results: [
        result("r1", "e1", "semi-1", 4, 80),
        result("r3", "e3", "semi-3", 5, 75),
      ],
      jury: [],
      televote: [],
    });

    expect(stats.qualificationPct).toBe(100);
    expect(stats.consecutiveQualifications).toBe(1);
  });

  it("compares the canonical edition placement instead of whichever show row was last", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");
    const final = show("final-1", "e1", "grand-final");

    const options = {
      editions: [e1],
      shows: [semi, final],
      participants: [
        participant("a-semi", "e1", "semi-1", true, "a"),
        participant("a-final", "e1", "final-1", null, "a"),
        participant("b-semi", "e1", "semi-1", true, "b"),
        participant("b-final", "e1", "final-1", null, "b"),
      ],
      results: [
        result("a-final-result", "e1", "final-1", 2, 150, "a"),
        result("b-final-result", "e1", "final-1", 1, 160, "b"),
        result("a-semi-result", "e1", "semi-1", 1, 100, "a"),
        result("b-semi-result", "e1", "semi-1", 4, 70, "b"),
      ],
      jury: [],
      televote: [],
    };

    const headToHead = computeCanonicalHeadToHead("a", "b", options as any);
    expect(headToHead.sharedEditions).toBe(1);
    expect(headToHead.aWins).toBe(0);
    expect(headToHead.bWins).toBe(1);
    expect(headToHead.rows[0]?.aRank).toBe(2);
    expect(headToHead.rows[0]?.bRank).toBe(1);
  });

  it("counts a country once in a tied record while preserving all occurrence context", () => {
    const holders = collapseFanRecordHolders([
      {
        countryId: "a",
        countryName: "Aland",
        shortCode: "ALA",
        flagImage: null,
        accentColor: "#123456",
        context: "SSC 19",
      },
      {
        countryId: "a",
        countryName: "Aland",
        shortCode: "ALA",
        flagImage: null,
        accentColor: "#123456",
        context: "SSC 21",
      },
    ]);

    expect(holders).toHaveLength(1);
    expect(holders[0]?.countryId).toBe("a");
    expect(holders[0]?.context).toContain("SSC 19");
    expect(holders[0]?.context).toContain("SSC 21");
  });
});
