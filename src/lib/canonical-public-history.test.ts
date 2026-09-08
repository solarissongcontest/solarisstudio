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
    event_date: "2026-05-01",
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
      results: [result("final-result", "e1", "final-1", 1, 100)],
      countries: [country],
    });

    expect(stats.participations).toBe(1);
    expect(stats.finals).toBe(1);
    expect(stats.finalRate).toBe(100);
    expect(stats.totalFinalPoints).toBe(100);
    expect(stats.averageFinalPoints).toBe(100);
  });

  it("does not count a semi-only participant as a final appearance", () => {
    const e1 = edition("e1", 1);
    const semi = show("semi-1", "e1", "semi-final");

    const stats = computeCanonicalCountryStats("a", {
      editions: [e1],
      shows: [semi],
      participants: [
        participant("semi-row", "e1", "semi-1", false),
        participant("canonical-row", "e1", null),
      ],
      results: [],
      countries: [country],
    });

    expect(stats.participations).toBe(1);
    expect(stats.finals).toBe(0);
    expect(stats.finalRate).toBe(0);
  });

  it("deduplicates fan record holders by edition before counting appearances", () => {
    const collapsed = collapseFanRecordHolders([
      { editionId: "e1", showId: "semi-1", entityId: "a", rank: 1, points: 90 },
      { editionId: "e1", showId: "final-1", entityId: "a", rank: 1, points: 100 },
      { editionId: "e2", showId: "final-2", entityId: "a", rank: 2, points: 95 },
    ]);

    expect(collapsed).toHaveLength(2);
    expect(collapsed.find((row) => row.editionId === "e1")?.points).toBe(100);
  });

  it("deduplicates head-to-head edition comparisons", () => {
    const rows = computeCanonicalHeadToHead({
      entityA: "a",
      entityB: "b",
      participants: [
        participant("a-semi", "e1", "semi-1", true, "a"),
        participant("a-final", "e1", "final-1", null, "a"),
        participant("a-canonical", "e1", null, null, "a"),
        participant("b-semi", "e1", "semi-1", true, "b"),
        participant("b-final", "e1", "final-1", null, "b"),
        participant("b-canonical", "e1", null, null, "b"),
      ],
      results: [
        result("a-result", "e1", "final-1", 1, 100, "a"),
        result("b-result", "e1", "final-1", 2, 90, "b"),
      ],
    });

    expect(rows.comparisons).toBe(1);
    expect(rows.aWins).toBe(1);
    expect(rows.bWins).toBe(0);
  });
});
