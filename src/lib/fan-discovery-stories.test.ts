import { describe, expect, it } from "vitest";

import type { Country, Edition, Participant, ResultRow, Show } from "./data";
import { buildFanDiscovery } from "./fan-discovery";

const countries = [
  { id: "a", name: "A", short_code: "AAA", accent_color: "#111111", flag_image: null },
  { id: "b", name: "B", short_code: "BBB", accent_color: "#222222", flag_image: null },
  { id: "c", name: "C", short_code: "CCC", accent_color: "#333333", flag_image: null },
] as Country[];

const editions = [
  { id: "e1", edition_number: 1, name: "SSC 1", slug: "ssc-1" },
  { id: "e2", edition_number: 2, name: "SSC 2", slug: "ssc-2" },
] as Edition[];

const shows = [
  { id: "s1", edition_id: "e1", kind: "grand-final" },
  { id: "s2", edition_id: "e2", kind: "grand-final" },
] as Show[];

const participants = [
  { id: "pa1", edition_id: "e1", country_id: "a", show_id: null, artist: "Artist A", song: "Song A" },
  { id: "pb1", edition_id: "e1", country_id: "b", show_id: null, artist: "Artist B", song: "Song B" },
  { id: "pc1", edition_id: "e1", country_id: "c", show_id: null, artist: "Artist C", song: "Song C" },
  { id: "pa2", edition_id: "e2", country_id: "a", show_id: null, artist: "Artist A2", song: "Song A2" },
  { id: "pb2", edition_id: "e2", country_id: "b", show_id: null, artist: "Artist B2", song: "Song B2" },
  { id: "pc2", edition_id: "e2", country_id: "c", show_id: null, artist: "Artist C2", song: "Song C2" },
] as Participant[];

function result(
  id: string,
  editionId: string,
  showId: string,
  countryId: string,
  jury: number,
  tele: number,
  total: number,
  rank: number,
): ResultRow {
  return {
    id,
    edition_id: editionId,
    show_id: showId,
    country_id: countryId,
    jury_points: jury,
    televote_points: tele,
    total_points: total,
    final_rank: rank,
  };
}

describe("fan discovery story patterns", () => {
  it("surfaces a winner who wins neither half of the vote", () => {
    const stories = buildFanDiscovery({
      countries,
      editions: editions.slice(0, 1),
      shows: shows.slice(0, 1),
      participants: participants.filter((row) => row.edition_id === "e1"),
      jury: [],
      results: [
        result("a", "e1", "s1", "a", 80, 80, 160, 1),
        result("b", "e1", "s1", "b", 100, 40, 140, 2),
        result("c", "e1", "s1", "c", 30, 100, 130, 3),
      ],
    });

    const story = stories.find((item) => item.id === "split-decision-winner");
    expect(story?.countryId).toBe("a");
    expect(story?.value).toBe("Jury #2 · Tele #2");
    expect(story?.artist).toBe("Artist A");
    expect(story?.song).toBe("Song A");
  });

  it("surfaces true jury/televote consensus champions", () => {
    const stories = buildFanDiscovery({
      countries,
      editions: editions.slice(1),
      shows: shows.slice(1),
      participants: participants.filter((row) => row.edition_id === "e2"),
      jury: [],
      results: [
        result("a2", "e2", "s2", "a", 120, 140, 260, 1),
        result("b2", "e2", "s2", "b", 100, 80, 180, 2),
        result("c2", "e2", "s2", "c", 70, 100, 170, 3),
      ],
    });

    const story = stories.find((item) => item.id === "consensus-winner");
    expect(story?.countryId).toBe("a");
    expect(story?.value).toBe("#1 + #1");
  });

  it("shows when a jury winner falls after the combined result", () => {
    const stories = buildFanDiscovery({
      countries,
      editions: editions.slice(0, 1),
      shows: shows.slice(0, 1),
      participants: participants.filter((row) => row.edition_id === "e1"),
      jury: [],
      results: [
        result("a", "e1", "s1", "a", 120, 10, 130, 3),
        result("b", "e1", "s1", "b", 100, 100, 200, 1),
        result("c", "e1", "s1", "c", 90, 80, 170, 2),
      ],
    });

    const story = stories.find((item) => item.id === "fallen-jury-winner");
    expect(story?.countryId).toBe("a");
    expect(story?.value).toBe("#1 → #3");
  });
});
