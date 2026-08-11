import { describe, expect, it } from "vitest";

import type { Edition, JuryVote, Participant, ResultRow, Show } from "./data";
import { computeCountryForm } from "./form";
import { computeRelationship } from "./stats";
import { buildShowStories } from "./stories";

const edition = (id: string, number: number): Edition =>
  ({
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
  }) as Edition;

const show = (id: string, editionId: string): Show =>
  ({
    id,
    edition_id: editionId,
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 1,
    published: true,
    status: "completed",
    qualifier_count: null,
    theme_id: null,
    voting_config: {},
    broadcast_config: {},
    publication_config: {},
  }) as Show;

const result = (
  id: string,
  editionId: string,
  showId: string,
  rank: number,
  jury = 0,
  tele = 0,
): ResultRow => ({
  id: `${editionId}-${id}`,
  edition_id: editionId,
  show_id: showId,
  country_id: id,
  jury_points: jury,
  televote_points: tele,
  total_points: jury + tele,
  final_rank: rank,
});

const participant = (country: string, editionId: string, showId: string): Participant =>
  ({
    id: `${editionId}-${country}`,
    edition_id: editionId,
    show_id: showId,
    country_id: country,
    contest_entity_id: null,
    artist: null,
    song: null,
    running_order: null,
    semi_final: "final",
    qualified: true,
    notes: null,
  }) as Participant;

const vote = (
  voter: string,
  receiver: string,
  points: number,
  editionId: string,
  showId: string,
): JuryVote => ({
  id: `${editionId}-${voter}-${receiver}`,
  edition_id: editionId,
  show_id: showId,
  voter_country_id: voter,
  receiving_country_id: receiver,
  points,
});

describe("country form", () => {
  it("normalizes placement for field size and favors recent editions", () => {
    const editions = [edition("e1", 1), edition("e2", 2)];
    const shows = [show("s1", "e1"), show("s2", "e2")];
    const results = [
      result("a", "e1", "s1", 4),
      result("b", "e1", "s1", 1),
      result("c", "e1", "s1", 2),
      result("d", "e1", "s1", 3),
      result("a", "e2", "s2", 1),
      result("b", "e2", "s2", 2),
      result("c", "e2", "s2", 3),
      result("d", "e2", "s2", 4),
    ];
    const participants = results.map((row) =>
      participant(row.country_id, row.edition_id, row.show_id!),
    );

    const form = computeCountryForm("a", {
      editions,
      shows,
      participants,
      results,
      jury: [],
      televote: [],
    });

    expect(form.timeline.map((point) => point.percentile)).toEqual([0, 100]);
    expect(form.formIndex).toBeGreaterThan(50);
    expect(form.momentum).toBeGreaterThan(0);
  });

  it("measures voting breadth and top-three dependence from actual ballots", () => {
    const editions = [edition("e1", 1)];
    const shows = [show("s1", "e1")];
    const results = [result("a", "e1", "s1", 1, 24, 10)];
    const jury = [
      vote("b", "a", 12, "e1", "s1"),
      vote("c", "a", 8, "e1", "s1"),
      vote("d", "a", 4, "e1", "s1"),
      vote("e", "b", 12, "e1", "s1"),
    ];
    const form = computeCountryForm("a", {
      editions,
      shows,
      participants: [participant("a", "e1", "s1")],
      results,
      jury,
      televote: [],
    });

    expect(form.votingReach).toBe(75);
    expect(form.supportDependence).toBe(100);
  });
});

describe("normalized relationships", () => {
  it("uses shared voting opportunities and expected support", () => {
    const editions = [edition("e1", 1), edition("e2", 2)];
    const shows = [show("s1", "e1"), show("s2", "e2")];
    const results = editions.flatMap((item, index) => [
      result("a", item.id, shows[index].id, 1),
      result("b", item.id, shows[index].id, 2),
      result("c", item.id, shows[index].id, 3),
      result("d", item.id, shows[index].id, 4),
    ]);
    const jury = [
      vote("a", "b", 12, "e1", "s1"),
      vote("a", "c", 6, "e1", "s1"),
      vote("b", "a", 8, "e1", "s1"),
      vote("b", "c", 4, "e1", "s1"),
      vote("a", "b", 6, "e2", "s2"),
      vote("a", "c", 12, "e2", "s2"),
      vote("b", "a", 8, "e2", "s2"),
      vote("b", "c", 4, "e2", "s2"),
    ];

    const relationship = computeRelationship("a", "b", {
      editions,
      shows,
      results,
      jury,
    });

    expect(relationship.opportunitiesAtoB).toBe(2);
    expect(relationship.expectedAtoB).toBe(12);
    expect(relationship.supportLiftAtoB).toBe(1.5);
    expect(relationship.persistenceAtoB).toBe(100);
  });
});

describe("story engine", () => {
  it("finds close battles, channel winners and a decisive ballot", () => {
    const currentShow = show("s1", "e1");
    const results = [
      result("a", "e1", "s1", 1, 12, 10),
      result("b", "e1", "s1", 2, 8, 12),
      result("c", "e1", "s1", 3, 2, 1),
    ];
    const jury = [vote("x", "a", 8, "e1", "s1"), vote("x", "b", 4, "e1", "s1")];
    const stories = buildShowStories({
      show: currentShow,
      results,
      jury,
      labels: new Map([
        ["a", "A"],
        ["b", "B"],
        ["c", "C"],
        ["x", "X"],
      ]),
    });

    expect(stories.some((story) => story.kind === "closest-battle")).toBe(true);
    expect(stories.some((story) => story.kind === "decisive-voter")).toBe(true);
    expect(stories.some((story) => story.kind === "televote-darling")).toBe(true);
  });

  it("describes tied channel leaders without inventing a sole winner", () => {
    const currentShow = show("s1", "e1");
    const stories = buildShowStories({
      show: currentShow,
      results: [result("a", "e1", "s1", 1, 12, 10), result("b", "e1", "s1", 2, 12, 10)],
      jury: [],
      labels: new Map([
        ["a", "A"],
        ["b", "B"],
      ]),
    });

    expect(stories.find((story) => story.kind === "jury-darling")?.headline).toContain("shared");
    expect(stories.find((story) => story.kind === "televote-darling")?.headline).toContain(
      "shared",
    );
  });
});
