import { describe, expect, it } from "vitest";

import type { Show } from "./data";
import { projectV3LiveExperience } from "./v3-live";

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: "show-1",
    edition_id: "edition-1",
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 1,
    status: "scheduled",
    published: true,
    broadcast_config: {},
    publication_config: {
      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
      qualifiers: false,
      results: false,
      jury_results: false,
      televote_results: false,
      detailed_voting: false,
    },
    ...overrides,
  } as Show;
}

const base = {
  runningOrder: [
    {
      id: "entry-2",
      runningOrder: 2,
      countryId: "country-2",
      countryName: "Two",
      flagImage: null,
      artist: "Artist Two",
      song: "Song Two",
    },
    {
      id: "entry-1",
      runningOrder: 1,
      countryId: "country-1",
      countryName: "One",
      flagImage: null,
      artist: "Artist One",
      song: "Song One",
    },
  ],
  serverTime: "2026-10-18T20:00:00.000Z",
  generatedAt: "2026-10-18T20:00:01.000Z",
};

describe("Public V3 LiveExperience", () => {
  it("never invents a current or next performance from running order", () => {
    const experience = projectV3LiveExperience({
      ...base,
      show: show({
        status: "live",
        broadcast_config: { showMode: { phase: "live" } },
      }),
      televoteRound: null,
    });

    expect(experience.state).toBe("live");
    expect(experience.currentPerformance).toBeUndefined();
    expect(experience.nextPerformance).toBeUndefined();
    expect(experience.progress).toBeUndefined();
    expect(experience.runningOrder.map((entry) => entry.runningOrder)).toEqual([
      1,
      2,
    ]);
  });

  it("projects an authoritative linked voting round instead of a local timer", () => {
    const experience = projectV3LiveExperience({
      ...base,
      show: show(),
      televoteRound: {
        id: "round-1",
        name: "Grand Final vote",
        status: "open",
        openedAt: "2026-10-18T19:55:00.000Z",
        closedAt: null,
      },
    });

    expect(experience.state).toBe("voting");
    expect(experience.voting).toEqual({
      state: "open",
      label: "Voting open",
      roundId: "round-1",
    });
  });

  it("uses server time for starting-soon classification", () => {
    const experience = projectV3LiveExperience({
      ...base,
      show: show({
        broadcast_config: {
          showMode: {
            phase: "scheduled",
            scheduledStart: "2026-10-18T20:20:00.000Z",
          },
        },
      }),
      televoteRound: null,
    });

    expect(experience.state).toBe("starting_soon");
  });

  it("preserves paused, delayed and cancelled show authority", () => {
    for (const [status, expected] of [
      ["paused", "paused"],
      ["delayed", "delayed"],
      ["cancelled", "cancelled"],
    ] as const) {
      const experience = projectV3LiveExperience({
        ...base,
        show: show({ status }),
        televoteRound: null,
      });
      expect(experience.state).toBe(expected);
    }
  });

  it("refuses unsafe broadcast URLs", () => {
    const experience = projectV3LiveExperience({
      ...base,
      show: show({
        broadcast_config: {
          showMode: {
            phase: "live",
            youtubeUrl: "https://example.com/not-youtube",
          },
        },
      }),
      televoteRound: null,
    });

    expect(experience.broadcast).toBeUndefined();
  });
});