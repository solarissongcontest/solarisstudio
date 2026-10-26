import { describe, expect, it } from "vitest";

import type { Edition, ResultRow, Show } from "./data";
import {
  resolveCurrentPublicEdition,
  resolvePublicContestState,
  resolvePublicEditionState,
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

  it("never promotes a newer cancelled edition over an older active edition", () => {
    const selected = resolveCurrentPublicEdition([
      edition({ status: "cancelled" }),
      edition({
        id: "edition-21",
        edition_number: 21,
        slug: "ssc-21",
        status: "active",
      }),
    ]);

    expect(selected?.id).toBe("edition-21");
  });

  it("returns no current edition when every published edition is cancelled", () => {
    const cancelled = edition({ status: "cancelled" });

    expect(resolveCurrentPublicEdition([cancelled])).toBeNull();

    const state = resolvePublicContestState({
      editions: [cancelled],
      shows: [show({ status: "live" })],
      results: [result()],
    });

    expect(state.edition).toBeNull();
    expect(state.phase).toBe("between_editions");
    expect(state.primaryAction?.to).toBe("/explore");
    expect(state.primaryAction?.to).not.toBe("/participate");
  });

  it("resolves an individual edition without recursion", () => {
    const state = resolvePublicEditionState({
      edition: edition({ status: "active" }),
      shows: [show({ status: "scheduled" })],
      results: [],
    });

    expect(state.edition?.id).toBe("edition-22");
    expect(state.phase).toBe("submissions");
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

  it("does not call prepared result rows published when the show result layer is private", () => {
    const state = resolvePublicContestState({
      editions: [edition({ status: "active" })],
      shows: [
        show({
          publication_config: {
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
          },
        }),
      ],
      results: [result()],
    });

    expect(state.phase).toBe("submissions");
    expect(state.statusLabel).toBe("Current edition");
    expect(state.statusLabel).not.toBe("Results");
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

  it("keeps a completed edition completed even when its final result is published", () => {
    const state = resolvePublicContestState({
      editions: [edition({ status: "completed" })],
      shows: [show()],
      results: [result()],
    });

    expect(state.phase).toBe("post_edition");
    expect(state.statusLabel).toBe("Completed");
  });

  it("makes cancellation outrank stale live and result decoration without reopening participation", () => {
    const state = resolvePublicEditionState({
      edition: edition({ status: "cancelled" }),
      shows: [
        show({
          status: "live",
          publication_config: {
            participants: true,
            artists: true,
            songs: true,
            semi_split: true,
            running_order: true,
            qualifiers: true,
            results: true,
            jury_results: true,
            televote_results: true,
            detailed_voting: true,
          },
        }),
      ],
      results: [result()],
    });

    expect(state.lifecycle).toBe("cancelled");
    expect(state.phase).toBe("post_edition");
    expect(state.statusKey).toBe("closed");
    expect(state.statusLabel).toBe("Cancelled");
    expect(state.headline).toContain("was cancelled");
    expect(state.primaryAction?.to).toBe("/editions/ssc-22");
    expect(state.primaryAction?.to).not.toBe("/participate");
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
