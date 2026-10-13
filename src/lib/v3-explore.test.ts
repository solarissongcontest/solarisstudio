import { describe, expect, it } from "vitest";

import {
  buildV3EditionHubProjection,
  buildV3ExploreRootProjection,
  classifyV3ExploreOrResultsFeature,
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
  archiveGames: "/games",
  advancedDiscovery: "/discover",
} as const;

function edition(
  overrides: Partial<V3ExploreEditionInput> = {},
): V3ExploreEditionInput {
  return {
    id: "ssc22",
    slug: "ssc-22",
    name: "Solaris Song Contest 22",
    editionNumber: 22,
    year: 2026,
    hostLabel: "Tetlehamn, Oland",
    artworkUrl: "/artwork/ssc22.webp",
    visibility: "public",
    experience: "pre-show",
    resultsPublication: "hidden",
    href: "/editions/ssc-22",
    liveHref: "/shows/ssc22-final/live",
    nextEvent: {
      id: "sf1",
      title: "Semi-final 1",
      startsAt: "2026-10-20T18:00:00Z",
      href: "/shows/ssc22-sf1",
    },
    archiveEligible: false,
    ...overrides,
  };
}

function rootInput(
  overrides: Partial<V3ExploreRootInput> = {},
): V3ExploreRootInput {
  return {
    currentEditionId: "ssc22",
    editions: [
      edition(),
      edition({
        id: "ssc99",
        slug: "ssc-99",
        name: "Solaris Song Contest 99",
        editionNumber: 99,
        href: "/editions/ssc-99",
        archiveEligible: true,
        experience: "archived",
      }),
      edition({
        id: "ssc21",
        slug: "ssc-21",
        name: "Solaris Song Contest 21",
        editionNumber: 21,
        href: "/editions/ssc-21",
        archiveEligible: true,
        experience: "archived",
      }),
    ],
    countries: [
      { id: "ol", title: "Oland", href: "/countries/ol", visibility: "public" },
      { id: "xx", title: "Private", href: "/countries/xx", visibility: "private" },
    ],
    songs: [
      { id: "song-1", title: "Song", href: "/entries/song-1", visibility: "public" },
    ],
    artists: [
      { id: "artist-1", title: "Artist", href: "/artists/artist-1", visibility: "public" },
      {
        id: "artist-2",
        title: "Scheduled artist",
        href: "/artists/artist-2",
        visibility: "scheduled",
      },
    ],
    shows: [
      { id: "show-1", title: "Final", href: "/shows/final", visibility: "public" },
    ],
    stories: [
      { id: "story-1", title: "Running order", href: "/stories/1", visibility: "public" },
    ],
    routes,
    ...overrides,
  };
}

function hubInput(
  editionInput: V3ExploreEditionInput,
): V3EditionHubInput {
  return {
    edition: editionInput,
    sections: {
      overview: { state: "available", href: `${editionInput.href}` },
      participants: { state: "available", href: `${editionInput.href}?tab=participants` },
      songs: { state: "available", href: `${editionInput.href}?tab=songs` },
      schedule: { state: "available", href: `${editionInput.href}?tab=schedule` },
      stories: { state: "available", href: `${editionInput.href}?tab=stories` },
      results: { state: "available", href: `${editionInput.href}?tab=results` },
    },
  };
}

describe("V3 Explore projection", () => {
  it("requires an explicit current edition instead of guessing from the highest edition number", () => {
    const projection = buildV3ExploreRootProjection(rootInput());

    expect(projection.currentEdition?.id).toBe("ssc22");
    expect(projection.currentEdition?.editionNumber).toBe(22);
    expect(projection.archive.editions.map((item) => item.id)).toEqual(["ssc99", "ssc21"]);
  });

  it("fails closed when the requested current edition is not public", () => {
    const input = rootInput({
      currentEditionId: "private-current",
      editions: [
        edition({
          id: "private-current",
          visibility: "private",
          editionNumber: 23,
        }),
      ],
    });

    expect(buildV3ExploreRootProjection(input).currentEdition).toBeNull();
  });

  it("counts only public discovery entities and reuses the existing global search", () => {
    const projection = buildV3ExploreRootProjection(rootInput());

    expect(projection.search).toEqual({
      integration: "existing-global-search",
      action: "open-existing-search",
    });
    expect(projection.discover).toEqual([
      expect.objectContaining({ key: "countries", publicItemCount: 1 }),
      expect.objectContaining({ key: "songs-and-artists", publicItemCount: 2 }),
      expect.objectContaining({ key: "shows", publicItemCount: 1 }),
      expect.objectContaining({ key: "stories", publicItemCount: 1 }),
    ]);
  });

  it("keeps result-analysis tools owned by Results rather than Explore", () => {
    expect(classifyV3ExploreOrResultsFeature("edition")).toBe("explore");
    expect(classifyV3ExploreOrResultsFeature("story")).toBe("explore");
    expect(classifyV3ExploreOrResultsFeature("scorechart")).toBe("results");
    expect(classifyV3ExploreOrResultsFeature("voting-dna")).toBe("results");
    expect(classifyV3ExploreOrResultsFeature("simulation")).toBe("results");
  });
});

describe("V3 Edition hub projection", () => {
  it("keeps the Results section visible but locked until official publication", () => {
    const projection = buildV3EditionHubProjection(hubInput(edition()));

    expect(projection).not.toBeNull();
    expect(projection?.sections.find((section) => section.key === "results")?.state).toBe(
      "locked",
    );
    expect(projection?.hero.resultsAvailable).toBe(false);
  });

  it("exposes Results after publication without moving analysis into Explore", () => {
    const projection = buildV3EditionHubProjection(
      hubInput(
        edition({
          experience: "results",
          resultsPublication: "published",
        }),
      ),
    );

    expect(projection?.sections.find((section) => section.key === "results")?.state).toBe(
      "available",
    );
    expect(projection?.hero.resultsAvailable).toBe(true);
  });

  it("shows Live Mode only from explicit canonical live state", () => {
    const preShow = buildV3EditionHubProjection(hubInput(edition()));
    const live = buildV3EditionHubProjection(
      hubInput(
        edition({
          experience: "live",
        }),
      ),
    );

    expect(preShow?.liveAction).toBeNull();
    expect(live?.liveAction).toEqual({
      label: "Open Live Mode",
      href: "/shows/ssc22-final/live",
    });
  });

  it("refuses to project a private edition hub", () => {
    const projection = buildV3EditionHubProjection(
      hubInput(
        edition({
          visibility: "private",
        }),
      ),
    );

    expect(projection).toBeNull();
  });
});
