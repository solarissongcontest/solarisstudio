import { describe, expect, it } from "vitest";

import {
  buildV3EditionHubProjection,
  buildV3ExploreRootProjection,
  type V3EditionHubInput,
  type V3ExploreEditionInput,
  type V3ExploreRootInput,
} from "./v3-explore";

const routes = {
  countries: "/countries/",
  songsAndArtists: "/entries",
  shows: "/shows",
  stories: "/stories",
  editionsArchive: "/editions/",
  wiki: "/wiki",
  encyclopedia: "/encyclopedia",
} as const;

function edition(
  id: string,
  overrides: Partial<V3ExploreEditionInput> = {},
): V3ExploreEditionInput {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    editionNumber: 22,
    year: 2026,
    hostLabel: null,
    artworkUrl: null,
    visibility: "public",
    experience: "pre-show",
    resultsPublication: "hidden",
    href: `/editions/${id}`,
    liveHref: `/shows/${id}-final/live`,
    nextEvent: {
      id: `${id}-next`,
      title: "Next show",
      startsAt: "2026-10-20T18:00:00Z",
      href: `/shows/${id}-next`,
    },
    archiveEligible: false,
    ...overrides,
  };
}

function rootInput(
  editions: readonly V3ExploreEditionInput[],
  currentEditionId: string | null,
): V3ExploreRootInput {
  return {
    currentEditionId,
    editions,
    countries: [],
    songs: [],
    artists: [],
    shows: [],
    stories: [],
    routes,
  };
}

function hubInput(value: V3ExploreEditionInput): V3EditionHubInput {
  return {
    edition: value,
    sections: {
      overview: { state: "available", href: "#edition-overview" },
      participants: { state: "empty", href: "#edition-participants" },
      songs: { state: "empty", href: "#edition-songs" },
      schedule: { state: "empty", href: "#edition-schedule" },
      stories: { state: "empty", href: "#edition-stories" },
      results: { state: "empty", href: "#edition-results" },
    },
  };
}

describe("V3 public archive continuity", () => {
  it("does not let a stale current-edition id promote an archived edition out of history", () => {
    const archived = edition("ssc21", {
      experience: "archived",
      archiveEligible: true,
      resultsPublication: "published",
    });

    const projection = buildV3ExploreRootProjection(
      rootInput([archived], archived.id),
    );

    expect(projection.currentEdition).toBeNull();
    expect(projection.archive.editions.map((item) => item.id)).toEqual([archived.id]);
  });

  it("strips stale next-event actions from terminal historical states", () => {
    const results = edition("ssc20", {
      experience: "results",
      resultsPublication: "published",
      archiveEligible: true,
    });
    const completed = edition("ssc19", {
      experience: "post-edition",
      resultsPublication: "published",
      archiveEligible: true,
    });
    const archived = edition("ssc18", {
      experience: "archived",
      resultsPublication: "published",
      archiveEligible: true,
    });

    const projection = buildV3ExploreRootProjection(
      rootInput([results, completed, archived], null),
    );

    expect(projection.archive.editions).toEqual([
      expect.objectContaining({ id: "ssc20", nextEvent: null }),
      expect.objectContaining({ id: "ssc19", nextEvent: null }),
      expect.objectContaining({ id: "ssc18", nextEvent: null }),
    ]);
  });

  it("keeps next-event context only for active edition phases", () => {
    const active = edition("ssc22", { experience: "live" });
    const projection = buildV3ExploreRootProjection(
      rootInput([active], active.id),
    );

    expect(projection.currentEdition?.nextEvent).toEqual(active.nextEvent);
  });

  it("keeps archived edition hubs free of live and next-event actions", () => {
    const archived = edition("ssc17", {
      experience: "archived",
      archiveEligible: true,
      resultsPublication: "published",
    });

    const projection = buildV3EditionHubProjection(hubInput(archived));

    expect(projection?.hero.nextEvent).toBeNull();
    expect(projection?.liveAction).toBeNull();
    expect(projection?.hero.resultsAvailable).toBe(true);
  });
});
