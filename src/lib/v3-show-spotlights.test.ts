import { describe, expect, it } from "vitest";

import type { ShowDiscovery, ShowDiscoveryItem } from "./v3-discovery-entities";
import { buildShowSpotlights } from "./v3-show-spotlights";

const item = (id: string) => ({
  show: { id },
  edition: { id: "e22" },
}) as ShowDiscoveryItem;

function discovery(overrides: Partial<ShowDiscovery> = {}): ShowDiscovery {
  return {
    currentEdition: { id: "e22" } as ShowDiscovery["currentEdition"],
    liveNow: [],
    upNext: [],
    recent: [],
    currentEditionShows: [],
    archive: [],
    ...overrides,
  };
}

describe("V3 Shows editorial spotlight curation", () => {
  it("keeps each real show in only one priority section", () => {
    const live = item("live");
    const next = item("next");
    const completed = item("completed");
    const remaining = item("remaining");
    const sections = buildShowSpotlights(discovery({
      liveNow: [live],
      upNext: [next],
      recent: [completed],
      currentEditionShows: [completed, live, next, remaining],
    }), "SSC 22");

    expect(sections.map((section) => section.id)).toEqual([
      "shows-live-now", "shows-up-next", "shows-recent", "shows-current-edition",
    ]);
    expect(sections.map((section) => section.items.map((entry) => entry.show.id))).toEqual([
      ["live"], ["next"], ["completed"], ["remaining"],
    ]);
    expect(sections[0].items[0]).toBe(live);
    expect(sections[3].items[0]).toBe(remaining);
  });

  it("caps non-live spotlights but never drops live shows", () => {
    const live = Array.from({ length: 6 }, (_, i) => item(`live-${i}`));
    const upcoming = Array.from({ length: 8 }, (_, i) => item(`up-${i}`));
    const sections = buildShowSpotlights(discovery({
      liveNow: live,
      upNext: upcoming,
    }), "SSC 22");
    expect(sections[0].items).toHaveLength(6);
    expect(sections[1].items.map((value) => value.show.id)).toEqual([
      "up-0", "up-1", "up-2", "up-3",
    ]);
  });

  it("does not show a fictional current edition after a season ends", () => {
    const archived = item("archived");
    const sections = buildShowSpotlights(discovery({
      currentEdition: null,
      recent: [archived],
      currentEditionShows: [archived],
      archive: [archived],
    }), "");
    expect(sections.map((section) => section.id)).toEqual(["shows-recent"]);
  });

  it("preserves installed-app spotlight overlap", () => {
    const live = item("live");
    const next = item("next");
    const recent = item("recent");
    const sections = buildShowSpotlights(discovery({
      liveNow: [live],
      upNext: [next],
      recent: [recent],
      currentEditionShows: [recent, live, next],
    }), "SSC 22", "legacy-app");
    expect(sections.map((section) => section.items.map((value) => value.show.id))).toEqual([
      ["live"], ["next"], ["recent"], ["recent", "live", "next"],
    ]);
  });

  it("does not mutate the canonical discovery arrays", () => {
    const shared = item("shared");
    const input = discovery({
      liveNow: [shared],
      recent: [shared],
      currentEditionShows: [shared],
    });
    const snapshot = {
      liveNow: [...input.liveNow],
      recent: [...input.recent],
      currentEditionShows: [...input.currentEditionShows],
    };
    buildShowSpotlights(input, "SSC 22");
    expect(input.liveNow).toEqual(snapshot.liveNow);
    expect(input.recent).toEqual(snapshot.recent);
    expect(input.currentEditionShows).toEqual(snapshot.currentEditionShows);
  });
});
