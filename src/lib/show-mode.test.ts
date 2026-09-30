import { describe, expect, it } from "vitest";

import { DEFAULT_SHOW_MODE, resolveBroadcast } from "@/lib/broadcast";
import type { Show } from "@/lib/data";
import {
  preferredShowModeShow,
  resolveShowCompanionState,
  safeShowModeYoutubeUrl,
  transitionShowModePhase,
} from "@/lib/show-mode";

function show(patch: Partial<Show> = {}): Show {
  return {
    id: "show-1",
    edition_id: "edition-1",
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 1,
    published: true,
    status: "scheduled",
    qualifier_count: null,
    theme_id: null,
    voting_config: null,
    broadcast_config: {
      showMode: {
        ...DEFAULT_SHOW_MODE,
      },
    },
    publication_config: {
      participants: true,
      artists: true,
      songs: true,
      semi_split: false,
      running_order: true,
      qualifiers: false,
      results: false,
      jury_results: false,
      televote_results: false,
      detailed_voting: false,
    },
    ...patch,
  };
}

describe("event-driven Show Mode", () => {
  it("keeps scheduled shows scheduled without inventing live state", () => {
    expect(resolveShowCompanionState({ show: show() }).phase).toBe("scheduled");
  });

  it("uses the linked authoritative voting round for open and closed states", () => {
    const active = show({
      broadcast_config: {
        showMode: { ...DEFAULT_SHOW_MODE, phase: "live", televoteRoundId: "round-1" },
      },
    });

    expect(
      resolveShowCompanionState({
        show: active,
        televoteRound: {
          id: "round-1",
          name: "Grand Final live vote",
          status: "open",
          openedAt: "2026-09-30T18:00:00Z",
          closedAt: null,
        },
      }).phase,
    ).toBe("voting_open");

    expect(
      resolveShowCompanionState({
        show: active,
        televoteRound: {
          id: "round-1",
          name: "Grand Final live vote",
          status: "closed",
          openedAt: "2026-09-30T18:00:00Z",
          closedAt: "2026-09-30T18:20:00Z",
        },
      }).phase,
    ).toBe("voting_closed");
  });

  it("lets publication automatically supersede manual live state", () => {
    const published = show({
      broadcast_config: {
        showMode: { ...DEFAULT_SHOW_MODE, phase: "live" },
      },
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
        detailed_voting: false,
      },
    });

    const state = resolveShowCompanionState({ show: published });
    expect(state.phase).toBe("results_published");
    expect(state.resultsPublished).toBe(true);
  });

  it("keeps an explicitly ended show ended while retaining result availability", () => {
    const ended = show({
      broadcast_config: {
        showMode: { ...DEFAULT_SHOW_MODE, phase: "ended" },
      },
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
        detailed_voting: false,
      },
    });

    const state = resolveShowCompanionState({ show: ended });
    expect(state.phase).toBe("ended");
    expect(state.resultsPublished).toBe(true);
  });

  it("records manual phase timestamps without fabricating performance timing", () => {
    const live = transitionShowModePhase(
      DEFAULT_SHOW_MODE,
      "live",
      "2026-09-30T18:00:00.000Z",
    );
    expect(live.liveStartedAt).toBe("2026-09-30T18:00:00.000Z");
    expect(live.resultsStartedAt).toBeNull();

    const results = transitionShowModePhase(
      live,
      "results_in_progress",
      "2026-09-30T20:00:00.000Z",
    );
    expect(results.liveStartedAt).toBe("2026-09-30T18:00:00.000Z");
    expect(results.resultsStartedAt).toBe("2026-09-30T20:00:00.000Z");
  });

  it("accepts only HTTPS YouTube destinations", () => {
    expect(safeShowModeYoutubeUrl("https://youtu.be/test")).toBe("https://youtu.be/test");
    expect(safeShowModeYoutubeUrl("https://www.youtube.com/watch?v=test")).toContain(
      "youtube.com/watch",
    );
    expect(safeShowModeYoutubeUrl("http://youtube.com/watch?v=test")).toBeNull();
    expect(safeShowModeYoutubeUrl("https://example.com/watch?v=test")).toBeNull();
  });

  it("preserves showMode config through the shared broadcast resolver", () => {
    const config = resolveBroadcast({
      showMode: {
        ...DEFAULT_SHOW_MODE,
        phase: "live",
        youtubeUrl: "https://youtu.be/test",
      },
      studio2Rundown: { version: 2 },
    });
    expect(config.showMode.phase).toBe("live");
    expect(config.showMode.youtubeUrl).toContain("youtu.be");
  });

  it("prefers a manually live show over a merely scheduled show", () => {
    const scheduled = show({
      id: "scheduled",
      sort_order: 1,
      broadcast_config: {
        showMode: {
          ...DEFAULT_SHOW_MODE,
          scheduledStart: "2026-10-01T18:00:00.000Z",
        },
      },
    });
    const live = show({
      id: "live",
      sort_order: 2,
      broadcast_config: {
        showMode: { ...DEFAULT_SHOW_MODE, phase: "live" },
      },
    });
    expect(preferredShowModeShow([scheduled, live])?.id).toBe("live");
  });
});
