import { describe, expect, it } from "vitest";

import type { Edition } from "./data";
import {
  anniversaryPeriodForYear,
  buildAnniversaryRecap,
  editionIsInAnniversaryYear,
  finalRankingIsResolved,
  getSolarisAnniversary,
  ordinal,
} from "./anniversary";

type DatedEdition = Edition & { event_date?: string | null };

describe("Solaris anniversary", () => {
  it("activates on 17 September in the contest timezone", () => {
    const anniversary = getSolarisAnniversary(new Date("2026-09-17T12:00:00Z"));

    expect(anniversary.active).toBe(true);
    expect(anniversary.age).toBe(4);
    expect(anniversary.ordinal).toBe("4th");
    expect(anniversary.previousYear).toBe(2025);
  });

  it("does not activate on surrounding days and only increments age on the birthday", () => {
    const dayBefore = getSolarisAnniversary(new Date("2026-09-16T12:00:00Z"));
    const dayAfter = getSolarisAnniversary(new Date("2026-09-18T12:00:00Z"));

    expect(dayBefore.active).toBe(false);
    expect(dayBefore.age).toBe(3);
    expect(dayBefore.ordinal).toBe("3rd");
    expect(dayAfter.active).toBe(false);
    expect(dayAfter.age).toBe(4);
    expect(dayAfter.ordinal).toBe("4th");
  });

  it("formats anniversary ordinals", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(22)).toBe("22nd");
  });

  it("defines the fourth anniversary year as 17 Sep 2025 through 16 Sep 2026", () => {
    expect(anniversaryPeriodForYear(2026)).toEqual({
      start: "2025-09-17",
      endExclusive: "2026-09-17",
    });
    expect(editionIsInAnniversaryYear({ event_date: "2025-09-16" }, 2026)).toBe(false);
    expect(editionIsInAnniversaryYear({ event_date: "2025-09-17" }, 2026)).toBe(true);
    expect(editionIsInAnniversaryYear({ event_date: "2026-09-16" }, 2026)).toBe(true);
    expect(editionIsInAnniversaryYear({ event_date: "2026-09-17" }, 2026)).toBe(false);
    expect(editionIsInAnniversaryYear({ event_date: null }, 2026)).toBe(false);
  });

  it("treats zero-point placeholder rankings as unresolved", () => {
    expect(
      finalRankingIsResolved([
        { final_rank: 1, total_points: 0, jury_points: 0, televote_points: 0 },
        { final_rank: 2, total_points: 0, jury_points: 0, televote_points: 0 },
      ]),
    ).toBe(false);
    expect(
      finalRankingIsResolved([
        { final_rank: 1, total_points: 611, jury_points: 300, televote_points: 311 },
        { final_rank: 2, total_points: 444, jury_points: 250, televote_points: 194 },
      ]),
    ).toBe(true);
  });

  it("builds a year-in-review recap only from exactly dated anniversary-period editions", () => {
    const editions: DatedEdition[] = [
      {
        id: "e20",
        edition_number: 20,
        name: "SSC 20",
        year: 2025,
        event_date: "2025-08-30",
        slug: "ssc-20",
        description: null,
        host_country_id: null,
        host_city: null,
        logo: null,
        theme_id: null,
        status: "complete",
        published: true,
      },
      {
        id: "e21",
        edition_number: 21,
        name: "SSC 21",
        year: 2026,
        event_date: "2026-06-14",
        slug: "ssc-21",
        description: null,
        host_country_id: null,
        host_city: null,
        logo: null,
        theme_id: null,
        status: "complete",
        published: true,
      },
      {
        id: "e22",
        edition_number: 22,
        name: "SSC 22",
        year: 2026,
        event_date: null,
        slug: "ssc-22",
        description: null,
        host_country_id: null,
        host_city: null,
        logo: null,
        theme_id: null,
        status: "complete",
        published: true,
      },
    ];

    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions,
      shows: [
        {
          id: "gf21",
          edition_id: "e21",
          name: "Grand Final",
          kind: "grand-final",
          sort_order: 1,
          published: true,
          status: "complete",
          qualifier_count: null,
          theme_id: null,
          voting_config: null,
          broadcast_config: null,
          publication_config: null,
        },
      ],
      participants: [
        {
          id: "p1",
          edition_id: "e21",
          show_id: "gf21",
          country_id: "a",
          contest_entity_id: null,
          artist: "Artist A",
          song: "Song A",
          running_order: 1,
          semi_final: "final",
          qualified: true,
          notes: null,
        },
        {
          id: "p2",
          edition_id: "e21",
          show_id: "gf21",
          country_id: "b",
          contest_entity_id: null,
          artist: "Artist B",
          song: "Song B",
          running_order: 2,
          semi_final: "final",
          qualified: true,
          notes: null,
        },
      ],
      results: [
        {
          id: "r1",
          edition_id: "e21",
          show_id: "gf21",
          country_id: "a",
          contest_entity_id: null,
          jury_points: 100,
          televote_points: 100,
          total_points: 200,
          final_rank: 1,
        },
        {
          id: "r2",
          edition_id: "e21",
          show_id: "gf21",
          country_id: "b",
          contest_entity_id: null,
          jury_points: 99,
          televote_points: 99,
          total_points: 198,
          final_rank: 2,
        },
      ],
      countries: [
        { id: "a", name: "Asteria", native_name: null, short_code: "AST", flag_image: null, region: "North", accent_color: "#111111", description: null, first_participation: 1 },
        { id: "b", name: "Borealia", native_name: null, short_code: "BOR", flag_image: null, region: "North", accent_color: "#222222", description: null, first_participation: 1 },
      ],
    });

    expect(recap.editionCount).toBe(1);
    expect(recap.undatedPublishedEditionCount).toBe(1);
    expect(recap.winners[0]?.name).toBe("Asteria");
    expect(recap.closestFinal?.gap).toBe(2);
    expect(recap.stories.some((story) => story.id === "closest-final")).toBe(true);
  });

  it("orders winners chronologically even when show rows arrive out of order", () => {
    const edition = (id: string, number: number, eventDate: string): DatedEdition => ({
      id,
      edition_number: number,
      name: `SSC ${number}`,
      year: Number(eventDate.slice(0, 4)),
      event_date: eventDate,
      slug: `ssc-${number}`,
      description: null,
      host_country_id: null,
      host_city: null,
      logo: null,
      theme_id: null,
      status: "complete",
      published: true,
    });
    const show = (id: string, editionId: string) => ({
      id,
      edition_id: editionId,
      name: "Grand Final",
      kind: "grand-final",
      sort_order: 1,
      published: true,
      status: "complete",
      qualifier_count: null,
      theme_id: null,
      voting_config: null,
      broadcast_config: null,
      publication_config: null,
    });
    const result = (id: string, editionId: string, showId: string, countryId: string, rank: number, points: number) => ({
      id,
      edition_id: editionId,
      show_id: showId,
      country_id: countryId,
      contest_entity_id: null,
      jury_points: Math.floor(points / 2),
      televote_points: points - Math.floor(points / 2),
      total_points: points,
      final_rank: rank,
    });

    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [
        edition("e20", 20, "2026-06-13"),
        edition("e21", 21, "2026-08-07"),
      ],
      shows: [show("gf21", "e21"), show("gf20", "e20")],
      participants: [
        { id: "p20", edition_id: "e20", show_id: "gf20", country_id: "orn", contest_entity_id: null, artist: "A", song: "A", running_order: 1, semi_final: "final", qualified: true, notes: null },
        { id: "p21", edition_id: "e21", show_id: "gf21", country_id: "dia", contest_entity_id: null, artist: "B", song: "B", running_order: 1, semi_final: "final", qualified: true, notes: null },
      ],
      results: [
        result("r21w", "e21", "gf21", "dia", 1, 611),
        result("r21r", "e21", "gf21", "wit", 2, 444),
        result("r20w", "e20", "gf20", "orn", 1, 482),
        result("r20r", "e20", "gf20", "aot", 2, 412),
      ],
      countries: [
        { id: "dia", name: "Diaria", native_name: null, short_code: "DIA", flag_image: null, region: "Test", accent_color: "#111111", description: null, first_participation: 1 },
        { id: "orn", name: "Ørnådal", native_name: null, short_code: "ORN", flag_image: null, region: "Test", accent_color: "#222222", description: null, first_participation: 1 },
        { id: "wit", name: "Witfordge", native_name: null, short_code: "WIT", flag_image: null, region: "Test", accent_color: "#333333", description: null, first_participation: 1 },
        { id: "aot", name: "Aotea", native_name: null, short_code: "AOT", flag_image: null, region: "Test", accent_color: "#444444", description: null, first_participation: 1 },
      ],
    });

    expect(recap.winners.map((winner) => winner.name)).toEqual(["Ørnådal", "Diaria"]);
    expect(recap.winners.at(-1)).toMatchObject({ name: "Diaria", points: 611, edition: "SSC 21" });
  });
});
