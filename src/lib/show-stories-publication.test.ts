import { describe, expect, it } from "vitest";

import type { JuryVote, ResultRow, Show } from "./data";
import {
  DEFAULT_PUBLICATION_CONFIG,
  FULL_PUBLICATION_CONFIG,
  RESULTS_PUBLICATION_CONFIG,
} from "./publication";
import { buildShowStories } from "./stories";

function show(id: string, overrides: Partial<Show> = {}): Show {
  return {
    id,
    edition_id: "edition-1",
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 1,
    published: true,
    status: "ended",
    qualifier_count: null,
    theme_id: null,
    voting_config: { juryEnabled: true, televoteEnabled: true },
    broadcast_config: null,
    publication_config: { ...FULL_PUBLICATION_CONFIG },
    ...overrides,
  };
}

function result(showRow: Show, countryId: string, rank: number, jury: number, televote: number): ResultRow {
  return {
    id: `${showRow.id}-${countryId}`,
    edition_id: showRow.edition_id,
    show_id: showRow.id,
    country_id: countryId,
    final_rank: rank,
    jury_points: jury,
    televote_points: televote,
    total_points: jury + televote,
  };
}

function ballot(showRow: Show, voterId: string, receiverId: string, points: number): JuryVote {
  return {
    id: `${showRow.id}-${voterId}-${receiverId}`,
    edition_id: showRow.edition_id,
    show_id: showRow.id,
    voter_country_id: voterId,
    receiving_country_id: receiverId,
    points,
  };
}

function stories(current: Show, inputs?: {
  results?: ResultRow[];
  jury?: JuryVote[];
  allShows?: Show[];
  allResults?: ResultRow[];
}) {
  return buildShowStories({
    show: current,
    results: inputs?.results ?? [
      result(current, "winner", 1, 12, 10),
      result(current, "runner", 2, 8, 10),
    ],
    jury: inputs?.jury ?? [],
    labels: new Map([["winner", "Winner"], ["runner", "Runner"]]),
    allShows: inputs?.allShows,
    allResults: inputs?.allResults,
  });
}

describe("Show result story publication contracts", () => {
  it("never derives stories from private shows or an unreleased results layer", () => {
    const privateShow = show("private", { published: false });
    const entryOnly = show("entry-only", {
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        participants: true,
        artists: true,
        songs: true,
      },
    });

    expect(stories(privateShow)).toEqual([]);
    expect(stories(entryOnly)).toEqual([]);
  });

  it("keeps jury, televote and ballot-derived claims out of overall-only results", () => {
    const current = show("overall", {
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        participants: true,
        results: true,
      },
    });
    const resultStories = stories(current, {
      jury: [ballot(current, "voter", "winner", 12)],
    });
    const kinds = resultStories.map((item) => item.kind);

    expect(kinds).toContain("closest-battle");
    expect(kinds).not.toContain("jury-darling");
    expect(kinds).not.toContain("televote-darling");
    expect(kinds).not.toContain("polarizing");
    expect(kinds).not.toContain("decisive-voter");
  });

  it("allows published jury totals but hides individual-ballot inference until detailed voting is public", () => {
    const current = show("jury-totals", {
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        participants: true,
        results: true,
        jury_results: true,
      },
    });
    const resultStories = stories(current, {
      jury: [ballot(current, "voter", "winner", 12)],
    });
    const kinds = resultStories.map((item) => item.kind);

    expect(kinds).toContain("jury-darling");
    expect(kinds).not.toContain("televote-darling");
    expect(kinds).not.toContain("decisive-voter");
  });

  it("allows a published detailed ballot swing only for the exact show and edition", () => {
    const current = show("detailed");
    const resultStories = stories(current, {
      jury: [
        ballot(current, "voter", "winner", 12),
        ballot(current, "voter", "runner", 0),
        { ...ballot(current, "foreign", "runner", 50), edition_id: "other-edition" },
      ],
    });

    expect(resultStories.some((item) => item.kind === "decisive-voter")).toBe(true);
    const foreignOnly = stories(current, {
      jury: [{ ...ballot(current, "foreign", "winner", 12), edition_id: "other-edition" }],
    });
    expect(foreignOnly.some((item) => item.kind === "decisive-voter")).toBe(false);
  });

  it("compares records only against public, published, same-kind results with matching edition identity", () => {
    const current = show("current", { publication_config: RESULTS_PUBLICATION_CONFIG });
    const previous = show("previous", {
      edition_id: "edition-0",
      publication_config: null, // Legacy published shows retain the results preset.
    });
    const hidden = show("hidden", { published: false });
    const notYetResults = show("not-yet-results", {
      publication_config: { ...DEFAULT_PUBLICATION_CONFIG, participants: true },
    });
    const semiFinal = show("semi", { kind: "semi-final" });
    const currentRows = [
      result(current, "winner", 1, 70, 55),
      result(current, "runner", 2, 50, 50),
    ];
    const otherShows = [previous, hidden, notYetResults, semiFinal];
    const archived = [
      result(previous, "past-winner", 1, 60, 50),
      result(hidden, "secret-winner", 1, 500, 500),
      result(notYetResults, "unpublished-winner", 1, 450, 450),
      result(semiFinal, "other-kind-winner", 1, 400, 400),
      {
        ...result(previous, "wrong-edition", 1, 350, 350),
        edition_id: "different-edition",
      },
    ];

    const publishedHigh = stories(current, {
      results: currentRows,
      allShows: otherShows,
      allResults: archived,
    }).find((item) => item.kind === "record");

    expect(publishedHigh?.headline).toContain("highest published");
    expect(publishedHigh?.explanation).toContain("15 points above");

    const laterPublished = show("later", { edition_id: "edition-3" });
    const noGlobalRecord = stories(current, {
      results: currentRows,
      allShows: [...otherShows, laterPublished],
      allResults: [...archived, result(laterPublished, "later-winner", 1, 80, 60)],
    });
    expect(noGlobalRecord.some((item) => item.kind === "record")).toBe(false);
  });
});
