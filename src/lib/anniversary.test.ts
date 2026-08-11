import { describe, expect, it } from "vitest";

import { buildAnniversaryRecap, getSolarisAnniversary, ordinal } from "./anniversary";

describe("Solaris anniversary", () => {
  it("activates on 17 September in the contest timezone", () => {
    const anniversary = getSolarisAnniversary(new Date("2026-09-17T12:00:00Z"));

    expect(anniversary.active).toBe(true);
    expect(anniversary.age).toBe(4);
    expect(anniversary.ordinal).toBe("4th");
    expect(anniversary.previousYear).toBe(2025);
  });

  it("does not activate on surrounding days", () => {
    expect(getSolarisAnniversary(new Date("2026-09-16T12:00:00Z")).active).toBe(false);
    expect(getSolarisAnniversary(new Date("2026-09-18T12:00:00Z")).active).toBe(false);
  });

  it("formats anniversary ordinals", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(22)).toBe("22nd");
  });

  it("builds a year-in-review recap from anniversary-era contest data", () => {
    const recap = buildAnniversaryRecap({
      anniversaryYear: 2026,
      editions: [
        {
          id: "e20",
          edition_number: 20,
          name: "SSC 20",
          year: 2025,
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
          slug: "ssc-21",
          description: null,
          host_country_id: null,
          host_city: null,
          logo: null,
          theme_id: null,
          status: "complete",
          published: true,
        },
      ],
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

    expect(recap.winners[0]?.name).toBe("Asteria");
    expect(recap.closestFinal?.gap).toBe(2);
    expect(recap.stories.some((story) => story.id === "closest-final")).toBe(true);
  });
});
