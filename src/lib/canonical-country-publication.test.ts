import { describe, expect, it } from "vitest";

import { computeCanonicalCountryStats } from "./canonical-country-stats";

const PUBLIC_ENTRIES_ONLY = {
  participants: true,
  artists: true,
  songs: true,
  semi_split: true,
  running_order: false,
  qualifiers: false,
  results: false,
  jury_results: false,
  televote_results: false,
  detailed_voting: false,
};

describe("canonical country publication safety", () => {
  it("does not turn an unpublished placeholder rank into a public win", () => {
    const stats = computeCanonicalCountryStats("jaudia", {
      editions: [
        {
          id: "ssc22",
          edition_number: 22,
          name: "SSC 22",
          year: 2026,
          slug: "ssc-22",
          published: true,
        } as any,
      ],
      shows: [
        {
          id: "ssc22-final",
          edition_id: "ssc22",
          name: "Grand Final",
          kind: "grand-final",
          published: true,
          status: "draft",
          publication_config: PUBLIC_ENTRIES_ONLY,
        } as any,
      ],
      participants: [
        {
          id: "jaudia-22",
          edition_id: "ssc22",
          show_id: "ssc22-final",
          country_id: "jaudia",
          artist: "Hidden artist",
          song: "Hidden song",
          publication_status: "scheduled",
          scheduled_publish_at: "2099-01-01T00:00:00Z",
          qualified: null,
          running_order: 1,
          semi_final: "",
        } as any,
      ],
      results: [
        {
          id: "placeholder",
          edition_id: "ssc22",
          show_id: "ssc22-final",
          country_id: "jaudia",
          jury_points: 0,
          televote_points: 0,
          total_points: 0,
          final_rank: 1,
        } as any,
      ],
      jury: [],
      televote: [],
    });

    expect(stats.participations).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.podiums).toBe(0);
    expect(stats.timeline).toHaveLength(0);
  });
});