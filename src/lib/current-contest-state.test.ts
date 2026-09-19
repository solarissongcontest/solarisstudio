import { describe, expect, it } from "vitest";

import type { Edition, ResultRow, Show } from "./data";
import {
  resolveCurrentPublicEdition,
  resolvePublicContestState,
} from "./current-contest-state";

function edition(patch: Partial<Edition> = {}): Edition {
  return {
    id: "edition-22",
    edition_number: 22,
    name: "Solaris Song Contest 22",
    year: 2026,
    slug: "ssc-22",
    description: null,
    host_country_id: null,
    host_city: "Hanvør",
    logo: null,
    theme_id: null,
    status: "active",
    published: true,
    ...patch,
  };
}

function show(patch: Partial<Show> = {}): Show {
  return {
    id: "show-final",
    edition_id: "edition-22",
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 3,
    published: true,
    status: "scheduled",
    qualifier_count: null,
    theme_id: null,
    voting_config: null,
    broadcast_config: null,
    publication_config: null,
    ...patch,
  };
}

function result(patch: Partial<ResultRow> = {}): ResultRow {
  return {
    id: "result-1",
    edition_id: "edition-22",
    show_id: "show-final",
    country_id: "oland",
    jury_points: 100,
    televote_points: 120,
    total_points: 220,
    final_rank: 1,
    ...patch,
  };
}

describe("public contest state", () => {
  it("chooses the newest published non-terminal edition", () => {
    const selected = resolveCurrentPublicEdition([
      edition({
        id: "edition-21",
        edition_number: 21,
        slug: "ssc-21",
        status: "completed",
      }),
      edition(),
    ]);

    expect(selected?.edition_number).toBe(22);
  });

  it("does not call a legacy active edition live", () => {
    const state = resolvePublicContestState({
      editions: [edition({ status: "active" })],
      shows: [show({ status: "scheduled" })],
      results: [],
    });

    expect(state.phase).toBe("submissions");
    expect(state.statusLabel).toBe("Current edition");
    expect(state.statusLabel).not.toBe("Live");
  });

  it("uses an explicit live show as the live signal", () => {
    const state = resolvePublicContestState({
      editions: [edition({ status: "active" })],
      shows: [show({ status: "live" })],
      results: [],
    });

    expect(state.phase).toBe("live");
    expect(state.statusLabel).toBe("Live");
  });

  it("lets a published Grand Final result override stale legacy lifecycle state", () => {
    const state = resolvePublicContestState({
      editions: [edition({ status: "active" })],
      shows: [show()],
      results: [result()],
    });

    expect(state.phase).toBe("results_published");
    expect(state.statusLabel).toBe("Results");
  });

  it("returns a useful between-editions state when no edition is public", () => {
    const state = resolvePublicContestState({
      editions: [],
      shows: [],
      results: [],
    });

    expect(state.edition).toBeNull();
    expect(state.phase).toBe("between_editions");
    expect(state.primaryAction?.to).toBe("/explore");
  });
});
