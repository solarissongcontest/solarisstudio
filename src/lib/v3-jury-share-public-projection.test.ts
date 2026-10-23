import { describe, expect, it } from "vitest";
import { parseV3JuryShareSource, V3JuryShareProjectionError } from "./v3-jury-share-public-projection";

const points = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;

function readyPayload() {
  return {
    ok: true,
    visibility: "private",
    projection: {
      schemaVersion: 1,
      ballotId: "ballot-1",
      edition: {
        id: "edition-22",
        slug: "ssc-22",
        number: 22,
        name: "Solaris Song Contest 22",
        historicalIdentityVersion: "edition-history-v1",
      },
      show: { id: "show-final", name: "Grand Final", type: "final" },
      source: {
        delegationId: "edition-22:oland",
        countryId: "oland",
        displayName: "Oland",
        flagAsset: { id: "flag-oland", url: "/flags/oland.png", alt: "Oland flag" },
        identityVersion: "oland-history-v1",
      },
      votes: points.map((score, index) => ({
        recipientCountryId: `country-${index + 1}`,
        displayName: index === 1 ? "Hanvør" : `Country ${index + 1}`,
        flagAsset: {
          id: `flag-${index + 1}`,
          url: `/flags/country-${index + 1}.png`,
          alt: `Country ${index + 1} flag`,
        },
        identityVersion: `country-${index + 1}-history-v1`,
        points: score,
        rank: index + 1,
      })),
      result: { resultVersionId: "show-final:5", publishedAt: "2026-10-23T18:00:00Z" },
      themes: [
        { id: "default", state: "available" },
        { id: "edition", state: "unconfigured" },
        { id: "liquid_glass", state: "unsupported" },
      ],
      publication: { shareable: true, reason: null },
      stateVersion: "state-v5",
      serverTime: "2026-10-23T18:01:00Z",
    },
  };
}

describe("V3 Jury Share Public projection parser", () => {
  it("accepts the canonical System JSC-1/JSC-2 response without widening it", () => {
    const result = parseV3JuryShareSource(readyPayload());
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("expected ready Jury Share projection");

    expect(result.visibility).toBe("private");
    expect(result.projection.result.resultVersionId).toBe("show-final:5");
    expect(result.projection.edition.historicalIdentityVersion).toBe("edition-history-v1");
    expect(result.projection.votes.map((vote) => vote.points)).toEqual(points);
    expect(result.projection.votes[1]?.displayName).toBe("Hanvør");
    expect(result.themes).toEqual([
      { id: "default", state: "available", reason: undefined },
      { id: "edition", state: "unconfigured", reason: undefined },
      { id: "liquid_glass", state: "unsupported", reason: undefined },
    ]);
  });

  it("preserves server-owned unavailable publication state instead of inventing a projection", () => {
    expect(
      parseV3JuryShareSource({
        ok: false,
        errorCode: "JURY_SHARE_NOT_PUBLISHED",
        publication: { shareable: false, reason: "RESULTS_NOT_PUBLISHED" },
        serverTime: "2026-10-23T17:59:00Z",
      }),
    ).toEqual({
      state: "unavailable",
      errorCode: "JURY_SHARE_NOT_PUBLISHED",
      reason: null,
      publication: { shareable: false, reason: "RESULTS_NOT_PUBLISHED" },
      serverTime: "2026-10-23T17:59:00Z",
    });
  });

  it("rejects malformed point sets even if an upstream payload claims success", () => {
    const payload = readyPayload();
    payload.projection.votes = payload.projection.votes.slice(0, 9);
    expect(() => parseV3JuryShareSource(payload)).toThrow(/Expected 10 jury point rows/);
  });

  it("requires Default to remain available so one broken special theme cannot kill sharing", () => {
    const payload = readyPayload();
    payload.projection.themes = [
      { id: "default", state: "unsupported" },
      { id: "edition", state: "available" },
      { id: "liquid_glass", state: "available" },
    ];
    expect(() => parseV3JuryShareSource(payload)).toThrow(V3JuryShareProjectionError);
  });

  it("rejects duplicate recipients and unsupported visibility", () => {
    const duplicate = readyPayload();
    duplicate.projection.votes[1] = {
      ...duplicate.projection.votes[1],
      recipientCountryId: duplicate.projection.votes[0].recipientCountryId,
    };
    expect(() => parseV3JuryShareSource(duplicate)).toThrow(/Duplicate jury recipient/);

    const visibility = readyPayload();
    visibility.visibility = "organizer";
    expect(() => parseV3JuryShareSource(visibility)).toThrow(/visibility is unsupported/);
  });
});
