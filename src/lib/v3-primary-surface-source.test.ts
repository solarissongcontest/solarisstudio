import { describe, expect, it } from "vitest";

import type {
  CountryConfirmationRequirement,
  CountryConfirmationResponse,
} from "./confirmation-country-account";
import type { Edition, ResultRow, Show } from "./data";
import { assembleV3PrimarySurfaceSnapshot } from "./v3-primary-surface-source";

const edition: Edition = {
  id: "edition-22",
  edition_number: 22,
  name: "Hanvør 2026",
  year: 2026,
  slug: "hanvor-2026",
  description: null,
  host_country_id: null,
  host_city: "Hanvør",
  logo: null,
  theme_id: null,
  status: "confirmations",
  published: true,
};

const show: Show = {
  id: "show-1",
  edition_id: edition.id,
  name: "Grand Final",
  kind: "grand-final",
  sort_order: 1,
  published: true,
  status: "scheduled",
  publication_config: {
    participants: true,
    artists: true,
    songs: true,
    semi_split: true,
    running_order: true,
    qualifiers: true,
    results: false,
    jury_results: false,
    televote_results: false,
    detailed_voting: false,
  },
} as Show;

function base() {
  return {
    serverTime: "2026-10-12T06:00:00.000Z",
    generatedAt: "2026-10-12T06:00:00.100Z",
    targetEditionId: edition.id,
    editions: [edition],
    shows: [show],
    results: [] as ResultRow[],
    participantCount: 66,
    viewer: null,
    delegation: null,
    capabilities: [] as string[],
    confirmationResponses: [] as CountryConfirmationResponse[],
    confirmationRequirements: [] as CountryConfirmationRequirement[],
    rounds: [],
    acknowledgementTasks: 0,
    jury: null,
    televote: null,
  };
}

describe("Solaris Studio V3 primary surface production snapshot", () => {
  it("builds anonymous Home from public canonical state without participant evidence", () => {
    const snapshot = assembleV3PrimarySurfaceSnapshot(base());

    expect(snapshot.identity).toEqual({ userId: null, displayName: null });
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.publicContest.edition?.id).toBe(edition.id);
    expect(snapshot.primarySurfaces.upcoming).toEqual([
      {
        id: "show:show-1",
        title: "Grand Final",
        description: "Public show information is available.",
        to: "/shows/show-1",
      },
    ]);
    expect(snapshot.primarySurfaces.contestStats).toEqual([
      { value: "66", label: "Delegations" },
      { value: "1", label: "Public shows" },
    ]);
  });

  it("fails closed if anonymous bootstrap accidentally receives participant-scoped evidence", () => {
    expect(() =>
      assembleV3PrimarySurfaceSnapshot({
        ...base(),
        capabilities: ["official_communications"],
      }),
    ).toThrow(/Anonymous V3 bootstrap cannot contain participant-scoped evidence/);
  });

  it("derives signed-in confirmation work using the captured server time", () => {
    const requirement: CountryConfirmationRequirement = {
      id: "requirement-1",
      edition_id: edition.id,
      country_id: "country-oland",
      generation: 1,
      status: "required",
      reason: "Edition participation confirmation",
      valid_from: "2026-10-01T00:00:00.000Z",
      resolved_by_submission_id: null,
      resolved_at: null,
      created_at: "2026-10-01T00:00:00.000Z",
    };

    const snapshot = assembleV3PrimarySurfaceSnapshot({
      ...base(),
      viewer: { id: "user-1", displayName: null },
      delegation: { id: "country-oland", name: "Oland" },
      capabilities: ["official_communications"],
      confirmationRequirements: [requirement],
      rounds: [
        {
          id: "round-1",
          name: "Confirmation round",
          status: "open",
          opens_at: "2026-10-12T05:00:00.000Z",
          closes_at: "2026-10-12T07:00:00.000Z",
          response_limit: null,
          response_count: 0,
          edition_id: edition.id,
          edition_name: edition.name,
          edition_number: 22,
        },
      ],
      acknowledgementTasks: 1,
    });

    expect(snapshot.identity.userId).toBe("user-1");
    expect(snapshot.delegation).toEqual({ id: "country-oland", name: "Oland" });
    expect(snapshot.tasks.map((task) => task.kind)).toEqual(
      expect.arrayContaining(["confirmation", "notice"]),
    );
    const confirmation = snapshot.tasks.find((task) => task.kind === "confirmation");
    expect(confirmation?.state).toBe("needs_attention");
  });

  it("keeps open public televoting in signed-in Participate parity", () => {
    const snapshot = assembleV3PrimarySurfaceSnapshot({
      ...base(),
      viewer: { id: "user-1", displayName: null },
      delegation: { id: "country-oland", name: "Oland" },
      televote: {
        id: "tele-1",
        title: "Hanvør 2026 public voting",
        route: "/televoting",
        eligible: true,
        submitted: false,
        status: "open",
        closesAt: "2026-10-12T07:00:00.000Z",
        required: false,
      },
    });

    expect(snapshot.tasks).toContainEqual(
      expect.objectContaining({
        id: "televote:tele-1",
        kind: "televote",
        state: "available",
        importance: "optional",
        route: "/televoting",
      }),
    );
  });

  it("uses a requested published edition rather than silently switching context", () => {
    const oldEdition: Edition = {
      ...edition,
      id: "edition-21",
      edition_number: 21,
      name: "SSC 21",
      slug: "ssc-21",
      status: "archived",
    };

    const snapshot = assembleV3PrimarySurfaceSnapshot({
      ...base(),
      targetEditionId: oldEdition.id,
      editions: [edition, oldEdition],
      shows: [],
      participantCount: 0,
    });
    expect(snapshot.publicContest.edition?.id).toBe(oldEdition.id);

    expect(() =>
      assembleV3PrimarySurfaceSnapshot({
        ...base(),
        targetEditionId: "not-public",
      }),
    ).toThrow(/not a published Solaris edition/);
  });

  it("moves published show results from Coming up into Latest", () => {
    const result = {
      id: "result-1",
      edition_id: edition.id,
      show_id: show.id,
      country_id: "country-oland",
      final_rank: 1,
      jury_points: 100,
      televote_points: 120,
      total_points: 220,
    } as ResultRow;
    const publishedShow = {
      ...show,
      status: "completed",
      publication_config: {
        ...(show.publication_config as Record<string, boolean>),
        results: true,
      },
    } as Show;

    const snapshot = assembleV3PrimarySurfaceSnapshot({
      ...base(),
      shows: [publishedShow],
      results: [result],
    });

    expect(snapshot.primarySurfaces.upcoming).toEqual([]);
    expect(snapshot.primarySurfaces.latest[0]).toEqual({
      id: "results:show-1",
      title: "Grand Final results",
      description: "Published results are available.",
      to: "/shows/show-1",
    });
  });

  it("rejects backwards generated time and invalid counts", () => {
    expect(() =>
      assembleV3PrimarySurfaceSnapshot({
        ...base(),
        generatedAt: "2026-10-12T05:59:59.999Z",
      }),
    ).toThrow(/generatedAt cannot be before serverTime/);

    expect(() =>
      assembleV3PrimarySurfaceSnapshot({
        ...base(),
        participantCount: -1,
      }),
    ).toThrow(/participantCount must be a non-negative safe integer/);
  });
});
