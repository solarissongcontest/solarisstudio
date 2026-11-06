import { describe, expect, it, vi } from "vitest";

import type { PublicContestState } from "./current-contest-state";
import type { V3PrimarySurfaceServerSnapshot } from "./v3-primary-surface-bootstrap";
import { loadV3PrimarySurfaceBundle } from "./v3-primary-surface-bootstrap";

const publicContest: PublicContestState = {
  edition: {
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
    status: "submissions",
    published: true,
  },
  phase: "submissions",
  lifecycle: "submissions",
  statusKey: "current",
  statusLabel: "Current edition",
  headline: "SSC 22 is the current Solaris edition",
  description: "Delegations are preparing their entries.",
  primaryAction: { label: "Explore edition", to: "/editions/hanvor-2026" },
};

function snapshot(
  overrides: Partial<V3PrimarySurfaceServerSnapshot> = {},
): V3PrimarySurfaceServerSnapshot {
  return {
    publicContest,
    tasks: [],
    identity: { userId: "user-1", displayName: "Arthur" },
    delegation: { id: "country-oland", name: "Oland" },
    capabilities: ["entry.edit"],
    serverTime: "2026-10-12T04:00:00.000Z",
    generatedAt: "2026-10-12T04:00:00.100Z",
    primarySurfaces: {
      upcoming: [
        {
          id: "show-1",
          title: "Semi-final 1",
          description: "Tomorrow at 20:00 CEST",
          to: "/shows/show-1",
        },
      ],
      latest: [
        {
          id: "story-1",
          title: "Running order published",
          description: "The public running order is now available.",
          to: "/stories/running-order",
        },
      ],
      contestStats: [
        { value: "66", label: "Delegations" },
        { value: "18", label: "Semi-finalists" },
      ],
      liveShowLabel: null,
      resultsLabel: null,
      progressByActionId: {
        "entry:22": { current: 3, total: 5, label: "Entry details" },
      },
    },
    ...overrides,
  };
}

const request = {
  viewerId: "user-1",
  editionId: "edition-22",
  delegationId: "country-oland",
};

describe("Solaris Studio V3 primary surface bootstrap", () => {
  it("loads one server snapshot and shares one bootstrap object across shell, Home and Participate", async () => {
    const loadSnapshot = vi.fn(async () => snapshot());
    const bundle = await loadV3PrimarySurfaceBundle(request, { loadSnapshot });

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith(request);
    expect(bundle.home.bootstrap).toBe(bundle.bootstrap);
    expect(bundle.participate.bootstrap).toBe(bundle.bootstrap);
    expect(bundle.shell.editionLabel).toBe("SSC 22");
    expect(bundle.shell.phaseLabel).toBe("Current edition");
    expect(bundle.shell.participateAttentionCount).toBe(0);
  });

  it("derives Current contest from the same canonical PublicContestState already in the bootstrap snapshot", async () => {
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot(),
    });

    expect(bundle.home.currentContest).toEqual({
      title: "Hanvør 2026",
      headline: "SSC 22 is the current Solaris edition",
      meta: "Delegations are preparing their entries.",
      stats: [
        { value: "66", label: "Delegations" },
        { value: "18", label: "Semi-finalists" },
      ],
      liveHeadline: null,
      resultsHeadline: null,
    });
  });

  it("carries Coming up and Latest from the shared snapshot rather than inventing another loader", async () => {
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot(),
    });

    expect(bundle.home.upcoming).toEqual([
      {
        id: "show-1",
        title: "Semi-final 1",
        description: "Tomorrow at 20:00 CEST",
        to: "/shows/show-1",
      },
    ]);
    expect(bundle.home.latest[0]?.id).toBe("story-1");
  });

  it("allows canonically empty Home sections but not missing supplemental section data", async () => {
    const empty = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () =>
        snapshot({
          primarySurfaces: {
            upcoming: [],
            latest: [],
          },
        }),
    });
    expect(empty.home.upcoming).toEqual([]);
    expect(empty.home.latest).toEqual([]);

    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          ({
            ...snapshot(),
            primarySurfaces: undefined,
          }) as unknown as V3PrimarySurfaceServerSnapshot,
      }),
    ).rejects.toThrow(/require supplemental Home\/Participate data/);

    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          ({
            ...snapshot(),
            primarySurfaces: { latest: [] },
          }) as unknown as V3PrimarySurfaceServerSnapshot,
      }),
    ).rejects.toThrow(/upcoming must be supplied/);
  });

  it("rejects duplicate Home item identity and external navigation targets", async () => {
    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          snapshot({
            primarySurfaces: {
              upcoming: [
                { id: "same", title: "One", description: "One" },
                { id: "same", title: "Two", description: "Two" },
              ],
              latest: [],
            },
          }),
      }),
    ).rejects.toThrow(/duplicate id same/);

    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          snapshot({
            primarySurfaces: {
              upcoming: [],
              latest: [
                {
                  id: "external",
                  title: "External",
                  description: "Nope",
                  to: "https://example.com",
                },
              ],
            },
          }),
      }),
    ).rejects.toThrow(/internal Solaris route/);
  });

  it("rejects Home links that escape the origin through URL-normalized separators", async () => {
    // Browsers interpret "/\external.example" and "/<newline>/external.example"
    // as authority separators even though neither string begins with "//".
    for (const to of ["/\\external.example", "/\n/external.example", "/\t/external.example"]) {
      await expect(
        loadV3PrimarySurfaceBundle(request, {
          loadSnapshot: async () =>
            snapshot({
              primarySurfaces: {
                upcoming: [
                  { id: "unsafe", title: "Unsafe", description: "Unsafe link", to },
                ],
                latest: [],
              },
            }),
        }),
      ).rejects.toThrow(/internal Solaris route/);
    }

    const safe = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () =>
        snapshot({
          primarySurfaces: {
            upcoming: [
              {
                id: "safe",
                title: "Show",
                description: "Public show",
                to: "/shows/show-1?view=running-order#performances",
              },
            ],
            latest: [],
          },
        }),
    });
    expect(safe.home.upcoming[0]?.to).toBe("/shows/show-1?view=running-order#performances");
  });

  it("validates Participate progress without creating workflow truth", async () => {
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot(),
    });
    expect(bundle.participate.delegationLabel).toBe("Oland");
    expect(bundle.participate.progressByActionId["entry:22"]).toEqual({
      current: 3,
      total: 5,
      label: "Entry details",
    });

    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          snapshot({
            primarySurfaces: {
              upcoming: [],
              latest: [],
              progressByActionId: {
                bad: { current: 6, total: 5 },
              },
            },
          }),
      }),
    ).rejects.toThrow(/cannot exceed total/);
  });

  it("preserves parent bootstrap scope validation instead of trusting supplemental content", async () => {
    await expect(
      loadV3PrimarySurfaceBundle(request, {
        loadSnapshot: async () =>
          snapshot({
            identity: { userId: "another-user", displayName: null },
          }),
      }),
    ).rejects.toThrow(/viewer identity/);
  });

  it("exposes live/results headline overrides only from the canonical contest phase", async () => {
    const liveContest: PublicContestState = {
      ...publicContest,
      phase: "live",
      statusKey: "live",
      statusLabel: "Live",
      headline: "SSC 22 is live",
    };
    const live = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot({ publicContest: liveContest }),
    });
    expect(live.home.currentContest.liveHeadline).toBe("SSC 22 is live");
    expect(live.home.currentContest.resultsHeadline).toBeNull();

    const resultsContest: PublicContestState = {
      ...publicContest,
      phase: "results_published",
      statusKey: "published",
      statusLabel: "Results",
      headline: "SSC 22 results are published",
    };
    const results = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot({ publicContest: resultsContest }),
    });
    expect(results.home.currentContest.resultsHeadline).toBe(
      "SSC 22 results are published",
    );
    expect(results.home.currentContest.liveHeadline).toBeNull();
  });
  it("keeps published winner details out of a spoiler-protected Home projection", async () => {
    const protectedSnapshot = snapshot({
      publicContest: {
        ...publicContest,
        phase: "results_published",
        statusKey: "published",
        statusLabel: "Results",
        headline: "Oland wins SSC 22 with 500 points",
        description: "Oland finishes first ahead of Aotea.",
      },
      hideResultSpoilers: true,
      primarySurfaces: {
        upcoming: [],
        latest: [
          {
            id: "results:final",
            title: "Oland takes first place",
            description: "500 points put Oland on top.",
            to: "/shows/final",
          },
          {
            id: "contest:/editions/hanvor-2026",
            title: "Oland wins SSC 22",
            description: "First place for Oland.",
            to: "/editions/hanvor-2026",
          },
          {
            id: "story:non-results",
            title: "The broadcast schedule",
            description: "Production news without result spoilers.",
            to: "/stories/broadcast",
          },
        ],
        contestStats: [{ value: "Oland", label: "Winner" }],
        resultsLabel: "Oland is the winner",
      },
    });
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => protectedSnapshot,
    });

    expect(bundle.home.currentContest).toMatchObject({
      headline: "Hanvør 2026 results are published",
      meta: "Official results are available. Open Results when you're ready.",
      stats: [],
      resultsHeadline: null,
    });
    expect(bundle.home.resultsLabel).toBe("Results available to reveal");
    expect(bundle.home.latest.map(({ title }) => title)).toEqual([
      "Published results",
      "Published results",
      "The broadcast schedule",
    ]);
    expect(bundle.home.latest.map(({ to }) => to)).toEqual([
      "/shows/final",
      "/editions/hanvor-2026",
      "/stories/broadcast",
    ]);
    expect(JSON.stringify(bundle.home)).not.toContain("Oland wins");
    expect(JSON.stringify(bundle.home)).not.toContain("500 points");
  });

  it("preserves published result previews when spoiler hiding is disabled", async () => {
    const resultContest: PublicContestState = {
      ...publicContest,
      phase: "results_published",
      statusKey: "published",
      statusLabel: "Results",
      headline: "Oland wins SSC 22",
      description: "Published winner coverage.",
    };
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot({
        publicContest: resultContest,
        hideResultSpoilers: false,
        primarySurfaces: {
          upcoming: [],
          latest: [{
            id: "results:final",
            title: "Oland wins",
            description: "Publicly available results.",
            to: "/shows/final",
          }],
          contestStats: [{ value: "Oland", label: "Winner" }],
          resultsLabel: "Oland wins",
        },
      }),
    });
    expect(bundle.home.currentContest.headline).toBe("Oland wins SSC 22");
    expect(bundle.home.currentContest.resultsHeadline).toBe("Oland wins SSC 22");
    expect(bundle.home.currentContest.stats).toEqual([{ value: "Oland", label: "Winner" }]);
    expect(bundle.home.latest[0]?.title).toBe("Oland wins");
    expect(bundle.home.resultsLabel).toBe("Oland wins");
  });

  it("redacts completed-show result teasers even while another show is live", async () => {
    const bundle = await loadV3PrimarySurfaceBundle(request, {
      loadSnapshot: async () => snapshot({
        publicContest: {
          ...publicContest,
          phase: "live",
          statusKey: "live",
          statusLabel: "Live",
          headline: "SSC 22 is live",
        },
        hideResultSpoilers: true,
        primarySurfaces: {
          upcoming: [],
          latest: [{
            id: "results:semi-final",
            title: "Oland qualifies in first place",
            description: "A result spoiler from an earlier show.",
            to: "/shows/semi-final",
          }],
        },
      }),
    });
    expect(bundle.home.currentContest.headline).toBe("SSC 22 is live");
    expect(bundle.home.latest[0]).toEqual({
      id: "results:semi-final",
      title: "Published results",
      description: "Official results are available to reveal in Results.",
      to: "/shows/semi-final",
    });
  });

});
