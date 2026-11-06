import { describe, expect, it } from "vitest";

import type { Edition, Participant, ResultRow, Show } from "./data";
import {
  DEFAULT_PUBLICATION_CONFIG,
  RESULTS_PUBLICATION_CONFIG,
  type PublicationConfig,
} from "./publication";
import { buildRecordInsights } from "./pulse";

function edition(id: string, editionNumber: number, published = true): Edition {
  return {
    id,
    edition_number: editionNumber,
    name: id,
    year: 2026,
    slug: id,
    description: null,
    host_country_id: null,
    host_city: null,
    logo: null,
    theme_id: null,
    status: "completed",
    published,
  };
}

function show(
  id: string,
  editionId: string,
  publication: PublicationConfig = RESULTS_PUBLICATION_CONFIG,
  published = true,
): Show {
  return {
    id,
    edition_id: editionId,
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 1,
    published,
    status: "ended",
    qualifier_count: null,
    theme_id: null,
    voting_config: null,
    broadcast_config: null,
    publication_config: publication,
  };
}

function result(
  id: string,
  showId: string | null,
  editionId: string,
  score: number,
  countryId = id,
): ResultRow {
  return {
    id,
    show_id: showId,
    edition_id: editionId,
    country_id: countryId,
    jury_points: score,
    televote_points: score,
    total_points: score,
    final_rank: null,
  };
}

const editions = [edition("old", 21), edition("current", 22)];
const historicShows = [show("old-show", "old")];
const historicResults = [80, 90, 100].map((score, index) =>
  result(`old-${index}`, "old-show", "old", score),
);
const noParticipants: Participant[] = [];

function insights(
  current: ResultRow[],
  extraShows: Show[],
  extraHistorical: ResultRow[] = [],
  customEditions: Edition[] = editions,
) {
  return buildRecordInsights({
    editions: customEditions,
    shows: [...historicShows, ...extraShows],
    results: [...historicResults, ...extraHistorical, ...current],
    participants: noParticipants,
    nameForEntity: (id) => id,
  });
}

describe("Pulse record insight publication boundary", () => {
  it("excludes draft show results even when returned by a privileged caller", () => {
    const hidden = insights(
      [result("hidden", "draft-show", "current", 500)],
      [show("draft-show", "current", RESULTS_PUBLICATION_CONFIG, false)],
    );
    expect(hidden).toEqual([]);
  });

  it("only describes score layers expressly published for the show", () => {
    const totalOnly = { ...DEFAULT_PUBLICATION_CONFIG, results: true };
    const visible = insights(
      [result("current-result", "current-show", "current", 120)],
      [show("current-show", "current", totalOnly)],
    );

    expect(visible.map((item) => item.title)).toEqual([
      expect.stringContaining("total score record"),
    ]);
    expect(visible.some((item) => /jury|televote/i.test(item.title))).toBe(false);
  });

  it("does not use hidden historical results as a public record benchmark", () => {
    const hiddenHistorical = result("hidden-history", "hidden-old", "old", 999);
    const visible = insights(
      [result("current-result", "current-show", "current", 120)],
      [show("current-show", "current"), show("hidden-old", "old", RESULTS_PUBLICATION_CONFIG, false)],
      [hiddenHistorical],
    );

    expect(visible.some((item) => item.title.includes("total score record"))).toBe(true);
    expect(visible.every((item) => !item.summary.includes("999"))).toBe(true);
  });

  it("excludes edition-level results with no provable show publication", () => {
    expect(
      insights([result("unknown", null, "current", 999)], []),
    ).toEqual([]);
  });

  it("excludes results from unpublished editions even if a show is marked published", () => {
    expect(
      insights(
        [result("current-result", "current-show", "current", 500)],
        [show("current-show", "current")],
        [],
        [edition("old", 21), edition("current", 22, false)],
      ),
    ).toEqual([]);
  });

  it("does not use a hidden jury metric as a historical comparator", () => {
    const totalOnly = { ...DEFAULT_PUBLICATION_CONFIG, results: true };
    const visible = buildRecordInsights({
      editions,
      shows: [show("old-show", "old", totalOnly), show("current-show", "current")],
      results: [
        ...historicResults,
        result("current-result", "current-show", "current", 120),
      ],
      participants: noParticipants,
      nameForEntity: (id) => id,
    });
    expect(visible.some((item) => item.title.includes("jury score"))).toBe(false);
    expect(visible.some((item) => item.title.includes("total score"))).toBe(true);
  });
});
