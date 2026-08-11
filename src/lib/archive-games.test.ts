import { describe, expect, it } from "vitest";

import { buildArchiveGameQuestion } from "./archive-games";

const editions = [
  {
    id: "e1",
    edition_number: 1,
    name: "SSC 1",
    year: 2024,
    slug: "ssc-1",
    description: null,
    host_country_id: null,
    host_city: "Aster",
    logo: null,
    theme_id: null,
    status: "complete",
    published: true,
  },
  {
    id: "e2",
    edition_number: 2,
    name: "SSC 2",
    year: 2025,
    slug: "ssc-2",
    description: null,
    host_country_id: null,
    host_city: "Boreal",
    logo: null,
    theme_id: null,
    status: "complete",
    published: true,
  },
];

const shows = [
  {
    id: "s1",
    edition_id: "e1",
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
  {
    id: "s2",
    edition_id: "e2",
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
];

const participants = [
  {
    id: "p1",
    edition_id: "e1",
    show_id: "s1",
    country_id: "a",
    contest_entity_id: null,
    artist: "Artist A",
    song: "Song A",
    running_order: 1,
    semi_final: "",
    qualified: true,
    notes: null,
  },
  {
    id: "p2",
    edition_id: "e1",
    show_id: "s1",
    country_id: "b",
    contest_entity_id: null,
    artist: "Artist B",
    song: "Song B",
    running_order: 2,
    semi_final: "",
    qualified: true,
    notes: null,
  },
  {
    id: "p3",
    edition_id: "e2",
    show_id: "s2",
    country_id: "a",
    contest_entity_id: null,
    artist: "Artist A2",
    song: "Song A2",
    running_order: 1,
    semi_final: "",
    qualified: true,
    notes: null,
  },
];

const results = [
  {
    id: "r1",
    edition_id: "e1",
    show_id: "s1",
    country_id: "a",
    contest_entity_id: null,
    jury_points: 100,
    televote_points: 50,
    total_points: 150,
    final_rank: 1,
  },
  {
    id: "r2",
    edition_id: "e1",
    show_id: "s1",
    country_id: "b",
    contest_entity_id: null,
    jury_points: 40,
    televote_points: 80,
    total_points: 120,
    final_rank: 2,
  },
  {
    id: "r3",
    edition_id: "e2",
    show_id: "s2",
    country_id: "a",
    contest_entity_id: null,
    jury_points: 20,
    televote_points: 60,
    total_points: 80,
    final_rank: 3,
  },
];

const input = {
  editions,
  shows,
  participants,
  results,
  nameForEntity: (id: string) => id.toUpperCase(),
};

describe("Archive Games", () => {
  it("builds deterministic higher/lower questions", () => {
    const first = buildArchiveGameQuestion(input, "higher-lower", "same-seed");
    const second = buildArchiveGameQuestion(input, "higher-lower", "same-seed");

    expect(first).toEqual(second);
    expect(first?.options).toHaveLength(2);
    expect(first?.correctOptionId).toBe("a");
  });

  it("builds jury versus televote questions", () => {
    const question = buildArchiveGameQuestion(input, "jury-tele", "jury-seed");

    expect(question?.options.map((option) => option.id)).toEqual(["jury", "televote"]);
    expect(["jury", "televote"]).toContain(question?.correctOptionId);
  });

  it("builds edition detective questions from published editions", () => {
    const question = buildArchiveGameQuestion(input, "edition-detective", "edition-seed");

    expect(question).not.toBeNull();
    expect(question?.options.some((option) => option.id === question.correctOptionId)).toBe(true);
  });
});
