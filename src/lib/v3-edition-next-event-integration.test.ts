import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Show } from "./data";
import { resolveV3ExploreNextPublicEvent } from "./v3-explore-next-event";
import { buildV3EditionHubProjection, type V3EditionExperience } from "./v3-explore";

const source = () => readFileSync(
  resolve(process.cwd(), "src/integrations/v3/edition-source.server.ts"),
  "utf8",
);

function publicShow(overrides: Partial<Show> = {}): Show {
  return {
    id: "show-future",
    edition_id: "edition-22",
    name: "Grand Final",
    kind: "grand-final",
    sort_order: 2,
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
      showMode: { phase: "scheduled", scheduledStart: "2026-12-12T18:00:00Z" },
    },
    ...overrides,
  };
}

function editionHub(experience: V3EditionExperience, nextEvent: ReturnType<typeof resolveV3ExploreNextPublicEvent>) {
  return buildV3EditionHubProjection({
    edition: {
      id: "edition-22",
      slug: "ssc22",
      name: "Solaris Song Contest 22",
      editionNumber: 22,
      year: 2026,
      hostLabel: null,
      artworkUrl: null,
      visibility: "public",
      experience,
      resultsPublication: "hidden",
      href: "/editions/ssc22",
      nextEvent,
      archiveEligible: experience === "archived",
    },
    sections: {
      overview: { state: "available", href: "#edition-overview" },
      participants: { state: "empty", href: "#edition-participants" },
      songs: { state: "empty", href: "#edition-songs" },
      schedule: { state: "available", href: "#edition-schedule" },
      stories: { state: "empty", href: "#edition-stories" },
      results: { state: "empty", href: "#edition-results" },
    },
  });
}

describe("V3 Edition server-owned next public event", () => {
  it("wires the published exact-Edition Show collection into shared server-time chronology", () => {
    const server = source();
    expect(server).toContain('from "@/lib/v3-explore-next-event"');
    expect(server).toContain('const generatedAt = new Date().toISOString()');
    expect(server).toContain("nextEvent: resolveV3ExploreNextPublicEvent(shows, generatedAt)");
    expect(server).toContain("    generatedAt,");
    expect(server).not.toContain("nextEvent: null,");
    expect(server).toContain('.eq("edition_id", edition.id)');
    expect(server).toContain('.eq("published", true)');
  });

  it("projects the next scheduled published Show while keeping terminal history locked", () => {
    const serverTime = "2026-11-06T12:00:00Z";
    const nextEvent = resolveV3ExploreNextPublicEvent([
      publicShow({ id: "private", published: false }),
      publicShow({
        id: "past",
        broadcast_config: {
          showMode: { phase: "scheduled", scheduledStart: "2026-10-12T18:00:00Z" },
        },
      }),
      publicShow(),
    ], serverTime);

    expect(nextEvent).toEqual({
      id: "show-future",
      title: "Grand Final",
      startsAt: "2026-12-12T18:00:00Z",
      href: "/shows/show-future",
    });
    expect(editionHub("pre-show", nextEvent)?.hero.nextEvent).toEqual(nextEvent);
    expect(editionHub("post-edition", nextEvent)?.hero.nextEvent).toBeNull();
    expect(editionHub("archived", nextEvent)?.hero.nextEvent).toBeNull();
  });
});
