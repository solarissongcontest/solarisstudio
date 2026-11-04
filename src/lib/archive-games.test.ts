import { describe, expect, it } from "vitest";

import { archiveGameStats, buildArchiveGameQuestion } from "./archive-games";

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

  it("excludes unpublished, missing and cross-edition show results from the public game pool", () => {
    const hiddenShow = { ...shows[0], id: "hidden-show", published: false };
    const wrongShowResult = { ...results[0], id: "hidden-r", country_id: "hidden", show_id: "hidden-show" };
    const crossEditionResult = { ...results[0], id: "cross-r", country_id: "cross", show_id: "s2" };
    const missingShowResult = { ...results[0], id: "missing-r", country_id: "missing", show_id: "absent" };
    const editionAggregate = { ...results[0], id: "aggregate-r", country_id: "aggregate", show_id: null };
    const guardedInput = {
      ...input,
      shows: [...shows, hiddenShow],
      results: [...results, wrongShowResult, crossEditionResult, missingShowResult, editionAggregate],
    };

    // A published edition-wide aggregate is valid, but no show-specific
    // unpublished or cross-edition result may generate a public question.
    expect(archiveGameStats(guardedInput)).toEqual({
      resultCount: results.length + 1,
      editionCount: 2,
      showCount: 2,
      entityCount: 3,
    });
    const generated = buildArchiveGameQuestion(guardedInput, "jury-tele", "publication-boundary");
    expect(JSON.stringify(generated)).not.toMatch(/hidden|cross|missing|absent/);
  });

  it("does not borrow artist or song details from a different edition's participant", () => {
    const mismatchedParticipant = {
      ...participants[0],
      edition_id: "e2",
      artist: "Private Artist",
      song: "Private Song",
    };
    const question = buildArchiveGameQuestion(
      {
        ...input,
        results: results.slice(0, 2),
        participants: [mismatchedParticipant, participants[1]],
      },
      "higher-lower",
      "edition-boundary",
    );
    expect(question?.options.find((option) => option.id === "a")?.detail).toBe("SSC 1");
    expect(JSON.stringify(question)).not.toContain("Private Artist");
    expect(JSON.stringify(question)).not.toContain("Private Song");
  });
});
