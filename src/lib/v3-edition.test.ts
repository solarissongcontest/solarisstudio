import { describe, expect, it } from "vitest";

import {
  buildV3EditionPageProjection,
  type V3EditionPageInput,
} from "./v3-edition";
import type { V3ExploreEditionInput } from "./v3-explore";

function edition(
  overrides: Partial<V3ExploreEditionInput> = {},
): V3ExploreEditionInput {
  return {
    id: "edition-22",
    slug: "ssc22",
    name: "Solaris Song Contest 22",
    editionNumber: 22,
    year: 2026,
    hostLabel: "Tetlehamn",
    artworkUrl: null,
    visibility: "public",
    experience: "pre-show",
    resultsPublication: "hidden",
    href: "/editions/ssc22",
    liveHref: null,
    nextEvent: null,
    archiveEligible: false,
    ...overrides,
  };
}

function input(overrides: Partial<V3EditionPageInput> = {}): V3EditionPageInput {
  return {
    edition: edition(),
    description: "Current Solaris edition",
    participants: [
      {
        id: "oland",
        name: "Oland",
        shortCode: "OLA",
        flagImage: null,
        accentColor: "#ffffff",
        href: "/countries/OLA",
        participationStatus: "confirmed",
      },
    ],
    entries: [
      {
        id: "oland",
        name: "Oland",
        shortCode: "OLA",
        flagImage: null,
        accentColor: "#ffffff",
        href: "/countries/OLA",
        artist: "Artist",
        song: "Song",
      },
    ],
    shows: [
      {
        id: "final",
        name: "Grand Final",
        kind: "grand-final",
        href: "/shows/final",
        participantCount: 1,
        runningOrderAvailable: true,
        resultsAvailable: false,
      },
    ],
    story: null,
    resultShowHref: null,
    results: [],
    ...overrides,
  };
}

describe("V3 Edition page projection", () => {
  it("renders real section destinations rather than placeholder tab routes", () => {
    const projection = buildV3EditionPageProjection(input());

    expect(projection?.hub.sections.map((section) => section.href)).toEqual([
      "#edition-overview",
      "#edition-participants",
      "#edition-songs",
      "#edition-schedule",
      "#edition-stories",
      "#edition-results",
    ]);
    expect(projection?.hub.sections.find((section) => section.key === "participants")?.state).toBe(
      "available",
    );
  });

  it("keeps next-event chronology only in active pre-outcome lifecycle states", () => {
    const nextEvent = {
      id: "final",
      title: "Grand Final",
      startsAt: "2026-12-12T20:00:00+02:00",
      href: "/shows/final",
    };

    const active = buildV3EditionPageProjection(
      input({ edition: edition({ experience: "pre-show", nextEvent }) }),
    );
    const completed = buildV3EditionPageProjection(
      input({ edition: edition({ experience: "post-edition", nextEvent }) }),
    );
    const archived = buildV3EditionPageProjection(
      input({ edition: edition({ experience: "archived", nextEvent }) }),
    );

    expect(active?.hub.hero.nextEvent).toEqual(nextEvent);
    expect(completed?.hub.hero.nextEvent).toBeNull();
    expect(archived?.hub.hero.nextEvent).toBeNull();
  });

  it("keeps Results locked even if stray result rows are supplied before publication", () => {
    const projection = buildV3EditionPageProjection(
      input({
        resultShowHref: "/shows/final?from=results",
        results: [
          {
            id: "oland",
            name: "Oland",
            shortCode: "OLA",
            flagImage: null,
            accentColor: "#ffffff",
            href: "/countries/OLA",
            rank: 1,
            totalPoints: 250,
          },
        ],
      }),
    );

    expect(projection?.results.state).toBe("locked");
    expect(projection?.results.rows).toEqual([]);
    expect(projection?.results.showHref).toBeNull();
    expect(projection?.hub.sections.find((section) => section.key === "results")?.state).toBe(
      "locked",
    );
  });

  it("shows only official rank and total-score summary after publication", () => {
    const projection = buildV3EditionPageProjection(
      input({
        edition: edition({ resultsPublication: "published", experience: "results" }),
        resultShowHref: "/shows/final?from=results",
        results: [
          {
            id: "oland",
            name: "Oland",
            shortCode: "OLA",
            flagImage: null,
            accentColor: "#ffffff",
            href: "/countries/OLA",
            rank: 1,
            totalPoints: 250,
          },
        ],
      }),
    );

    expect(projection?.results.state).toBe("available");
    expect(projection?.results.rows).toEqual([
      expect.objectContaining({ rank: 1, totalPoints: 250 }),
    ]);
    expect(projection?.results.showHref).toBe("/shows/final?from=results");
  });

  it("preserves immutable published rows even when current participant state later changes", () => {
    const projection = buildV3EditionPageProjection(
      input({
        edition: edition({ resultsPublication: "published", experience: "results" }),
        participants: [
          {
            id: "oland",
            name: "Oland",
            shortCode: "OLA",
            flagImage: null,
            accentColor: "#ffffff",
            href: "/countries/OLA",
            participationStatus: "confirmed",
          },
          {
            id: "withdrawn",
            name: "Withdrawnland",
            shortCode: "WDL",
            flagImage: null,
            accentColor: "#888888",
            href: "/countries/WDL",
            participationStatus: "withdrawn",
          },
          {
            id: "dq",
            name: "Disqualifiedland",
            shortCode: "DQL",
            flagImage: null,
            accentColor: "#777777",
            href: "/countries/DQL",
            participationStatus: "disqualified",
          },
        ],
        resultShowHref: "/shows/final?from=results",
        results: [
          {
            id: "oland",
            name: "Oland",
            shortCode: "OLA",
            flagImage: null,
            accentColor: "#ffffff",
            href: "/countries/OLA",
            rank: 1,
            totalPoints: 250,
          },
          {
            id: "withdrawn",
            name: "Withdrawnland",
            shortCode: "WDL",
            flagImage: null,
            accentColor: "#888888",
            href: "/countries/WDL",
            rank: 2,
            totalPoints: 200,
          },
          {
            id: "dq",
            name: "Disqualifiedland",
            shortCode: "DQL",
            flagImage: null,
            accentColor: "#777777",
            href: "/countries/DQL",
            rank: 3,
            totalPoints: 150,
          },
        ],
      }),
    );

    expect(projection?.results.state).toBe("available");
    expect(projection?.results.rows.map((row) => row.id)).toEqual([
      "oland",
      "withdrawn",
      "dq",
    ]);
  });

  it("keeps a published immutable result available even if every current participant row is non-confirmed", () => {
    const projection = buildV3EditionPageProjection(
      input({
        edition: edition({ resultsPublication: "published", experience: "results" }),
        participants: [
          {
            id: "withdrawn",
            name: "Withdrawnland",
            shortCode: "WDL",
            flagImage: null,
            accentColor: "#888888",
            href: "/countries/WDL",
            participationStatus: "withdrawn",
          },
        ],
        resultShowHref: "/shows/final?from=results",
        results: [
          {
            id: "withdrawn",
            name: "Withdrawnland",
            shortCode: "WDL",
            flagImage: null,
            accentColor: "#888888",
            href: "/countries/WDL",
            rank: 1,
            totalPoints: 200,
          },
        ],
      }),
    );

    expect(projection?.results.state).toBe("available");
    expect(projection?.results.rows.map((row) => row.id)).toEqual(["withdrawn"]);
    expect(projection?.results.showHref).toBe("/shows/final?from=results");
  });

  it("keeps empty publication-safe sections explicit", () => {
    const projection = buildV3EditionPageProjection(
      input({ participants: [], entries: [], shows: [], story: null }),
    );

    expect(projection?.hub.sections.find((section) => section.key === "participants")?.state).toBe(
      "empty",
    );
    expect(projection?.hub.sections.find((section) => section.key === "songs")?.state).toBe(
      "empty",
    );
    expect(projection?.hub.sections.find((section) => section.key === "schedule")?.state).toBe(
      "empty",
    );
    expect(projection?.hub.sections.find((section) => section.key === "stories")?.state).toBe(
      "empty",
    );
  });

  it("refuses a private edition projection", () => {
    const projection = buildV3EditionPageProjection(
      input({ edition: edition({ visibility: "private" }) }),
    );
    expect(projection).toBeNull();
  });
});