import { describe, expect, it } from "vitest";

import type { Show } from "./data";
import { resolveV3ExploreNextPublicEvent } from "./v3-explore-next-event";

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: "show-1",
    edition_id: "edition-22",
    name: "Semi-final 1",
    kind: "semi-final",
    sort_order: 1,
    published: true,
    status: "scheduled",
    qualifier_count: null,
    theme_id: null,
    voting_config: null,
    publication_config: {
      participants: true,
      artists: false,
      songs: false,
      semi_split: false,
      running_order: false,
      qualifiers: false,
      results: false,
      jury_results: false,
      televote_results: false,
      detailed_voting: false,
    },
    broadcast_config: {
      showMode: {
        phase: "scheduled",
        scheduledStart: "2026-10-20T18:00:00Z",
      },
    },
    ...overrides,
  };
}

describe("V3 Explore next public event", () => {
  it("chooses the earliest future public scheduled show by canonical time", () => {
    const next = resolveV3ExploreNextPublicEvent(
      [
        show({
          id: "later",
          name: "Grand Final",
          sort_order: 3,
          broadcast_config: {
            showMode: { phase: "scheduled", scheduledStart: "2026-10-24T18:00:00Z" },
          },
        }),
        show({
          id: "next",
          name: "Semi-final 1",
          sort_order: 1,
          broadcast_config: {
            showMode: { phase: "scheduled", scheduledStart: "2026-10-20T18:00:00Z" },
          },
        }),
      ],
      "2026-10-19T12:00:00Z",
    );

    expect(next).toEqual({
      id: "next",
      title: "Semi-final 1",
      startsAt: "2026-10-20T18:00:00Z",
      href: "/shows/next",
    });
  });

  it("ignores private, past, ended and invalid schedules", () => {
    const next = resolveV3ExploreNextPublicEvent(
      [
        show({ id: "private", published: false }),
        show({
          id: "past",
          broadcast_config: {
            showMode: { phase: "scheduled", scheduledStart: "2026-10-18T18:00:00Z" },
          },
        }),
        show({
          id: "ended",
          status: "ended",
          broadcast_config: {
            showMode: { phase: "ended", scheduledStart: "2026-10-20T18:00:00Z" },
          },
        }),
        show({
          id: "invalid",
          broadcast_config: {
            showMode: { phase: "scheduled", scheduledStart: "definitely-not-a-time" },
          },
        }),
      ],
      "2026-10-19T12:00:00Z",
    );

    expect(next).toBeNull();
  });

  it("returns no chronology when server time itself is invalid", () => {
    expect(resolveV3ExploreNextPublicEvent([show()], "not-server-time")).toBeNull();
  });

  it("uses sort order only as a deterministic tie-break after canonical time", () => {
    const next = resolveV3ExploreNextPublicEvent(
      [
        show({ id: "second", name: "Second", sort_order: 2 }),
        show({ id: "first", name: "First", sort_order: 1 }),
      ],
      "2026-10-19T12:00:00Z",
    );

    expect(next?.id).toBe("first");
  });
});
