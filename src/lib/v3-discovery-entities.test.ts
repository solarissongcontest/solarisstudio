import { describe, expect, it } from "vitest";

import type { Country, Edition, Participant, Show } from "./data";
import { buildCountryDiscovery, buildShowDiscovery } from "./v3-discovery-entities";

function country(id: string, name: string, region = "North", firstParticipation = 20): Country {
  return {
    id,
    name,
    native_name: null,
    short_code: id.toUpperCase(),
    flag_image: null,
    region,
    accent_color: "#4466aa",
    description: null,
    first_participation: firstParticipation,
  };
}

function edition(id: string, number: number, status = "pre_show"): Edition {
  return {
    id,
    edition_number: number,
    name: `SSC ${number}`,
    year: 2026,
    slug: `ssc-${number}`,
    description: null,
    host_country_id: null,
    host_city: null,
    logo: null,
    theme_id: null,
    status,
    published: true,
  };
}

function participant(
  id: string,
  editionId: string,
  countryId: string,
  status: "confirmed" | "withdrawn" | "disqualified" = "confirmed",
): Participant & { participation_status: typeof status } {
  return {
    id,
    edition_id: editionId,
    show_id: null,
    country_id: countryId,
    contest_entity_id: null,
    artist: null,
    song: null,
    running_order: null,
    semi_final: "",
    qualified: null,
    notes: null,
    participation_status: status,
  };
}

function show(
  id: string,
  editionId: string,
  status: string,
  sortOrder: number,
  scheduledStart: string | null = null,
): Show {
  return {
    id,
    edition_id: editionId,
    name: id,
    kind: "semi-final",
    sort_order: sortOrder,
    published: true,
    status,
    qualifier_count: null,
    theme_id: null,
    voting_config: null,
    broadcast_config: {
      showMode: {
        phase: status === "ended" ? "ended" : status === "live" ? "live" : "scheduled",
        scheduledStart,
        youtubeUrl: "",
      },
    },
    publication_config: null,
  };
}

describe("V3 Chat 3 country discovery", () => {
  it("uses a non-terminal current edition and separates public participation states", () => {
    const countries = [
      country("aa", "Asteria", "Atlas", 22),
      country("bb", "Borealis", "Atlas", 20),
      country("cc", "Cyrene", "Hydra", 19),
      country("dd", "Doria", "Hydra", 18),
    ];
    const editions = [edition("e22", 22), edition("e21", 21, "archived")];

    const result = buildCountryDiscovery({
      countries,
      editions,
      currentParticipants: [
        participant("p1", "e22", "aa", "confirmed"),
        participant("p2", "e22", "bb", "withdrawn"),
        participant("p3", "e22", "cc", "disqualified"),
      ],
    });

    expect(result.currentEdition?.id).toBe("e22");
    expect(result.participating.map((item) => item.id)).toEqual(["aa"]);
    expect(result.debuting.map((item) => item.id)).toEqual(["aa"]);
    expect(result.withdrawn.map((item) => item.id)).toEqual(["bb"]);
    expect(result.disqualified.map((item) => item.id)).toEqual(["cc"]);
    expect(result.notParticipating.map((item) => item.id)).toEqual(["dd"]);
    expect(result.regions.map((item) => [item.name, item.countries.length])).toEqual([
      ["Atlas", 2],
      ["Hydra", 2],
    ]);
  });

  it("does not relabel an archived fallback as current participation", () => {
    const result = buildCountryDiscovery({
      countries: [country("aa", "Asteria")],
      editions: [edition("e21", 21, "archived")],
      currentParticipants: [participant("p1", "e21", "aa")],
    });

    expect(result.currentEdition).toBeNull();
    expect(result.participating).toEqual([]);
  });
});

describe("V3 Chat 3 show discovery", () => {
  it("separates live, upcoming, recent, current-edition and archive surfaces", () => {
    const editions = [edition("e22", 22), edition("e21", 21, "archived")];
    const result = buildShowDiscovery({
      editions,
      shows: [
        show("live-show", "e22", "live", 2),
        show("next-show", "e22", "scheduled", 3, "2026-11-01T18:00:00Z"),
        show("delayed-show", "e22", "delayed", 4, "2026-11-02T18:00:00Z"),
        show("recent-show", "e22", "ended", 1),
        show("archive-show", "e21", "ended", 1),
      ],
    });

    expect(result.currentEdition?.id).toBe("e22");
    expect(result.liveNow.map((item) => item.show.id)).toEqual(["live-show"]);
    expect(result.upNext.map((item) => item.show.id)).toEqual(["next-show", "delayed-show"]);
    expect(result.recent.map((item) => item.show.id)).toEqual(["recent-show", "archive-show"]);
    expect(result.currentEditionShows.map((item) => item.show.id)).toEqual([
      "recent-show",
      "live-show",
      "next-show",
      "delayed-show",
    ]);
    expect(result.archive.map((item) => item.show.id)).toEqual(["archive-show"]);
  });

  it("keeps paused and delayed shows explicit instead of pretending broadcasts are happy-path only", () => {
    const result = buildShowDiscovery({
      editions: [edition("e22", 22)],
      shows: [show("paused", "e22", "paused", 1), show("delayed", "e22", "delayed", 2)],
    });

    expect(result.liveNow[0]?.stateLabel).toBe("Paused");
    expect(result.upNext[0]?.stateLabel).toBe("Delayed");
  });
  it("retains recent published broadcasts across edition rollover without calling cancellations completed", () => {
    const unpublished = { ...edition("e20", 20, "archived"), published: false };
    const editions = [
      edition("e23", 23),
      edition("e22", 22, "archived"),
      edition("e21", 21, "archived"),
      unpublished,
    ];
    const shows = [
      show("new-historical", "e22", "ended", 3),
      show("cancelled-historical", "e22", "cancelled", 4),
      show("older-historical", "e21", "ended", 2),
      show("unpublished-historical", "e20", "ended", 5),
    ];

    const result = buildShowDiscovery({ editions, shows });
    expect(result.currentEdition?.id).toBe("e23");
    expect(result.recent.map((item) => item.show.id)).toEqual([
      "new-historical", "older-historical",
    ]);
    expect(result.archive.map((item) => item.show.id)).toContain("cancelled-historical");
    expect(result.recent.some((item) => item.show.id === "unpublished-historical")).toBe(false);

    const archiveOnly = buildShowDiscovery({ editions: editions.slice(1), shows });
    expect(archiveOnly.currentEdition).toBeNull();
    expect(archiveOnly.recent.map((item) => item.show.id)).toEqual([
      "new-historical", "older-historical",
    ]);
  });

  it("keeps stale scheduled and live shows of archived editions out of current discovery", () => {
    const result = buildShowDiscovery({
      editions: [edition("e22", 22), edition("e21", 21, "archived")],
      shows: [
        show("current-upcoming", "e22", "scheduled", 1),
        show("archived-scheduled", "e21", "scheduled", 1),
        show("archived-live", "e21", "live", 2),
      ],
    });
    expect(result.upNext.map((item) => item.show.id)).toEqual(["current-upcoming"]);
    expect(result.liveNow).toEqual([]);
    expect(result.archive.map((item) => item.show.id)).toEqual(["archived-live", "archived-scheduled"]);
  });

});
