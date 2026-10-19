import { describe, expect, it } from "vitest";
import {
  DEFAULT_JURY_SHARE_DESIGN,
  JURY_SHARE_POINTS,
  JURY_SHARE_TARGETS,
  V3_JURY_SHARE_CAPABILITY_ID,
  V3_JURY_SHARE_FOUNDATION,
  buildDefaultJuryShareModel,
  buildJuryShareRenderKeyMaterial,
  formatJuryShareText,
  normalizeJuryShareVotes,
  resolveJuryShareAvailability,
  resolveJuryShareThemes,
  type JuryShareProjection,
  type JuryShareVote,
} from "./v3-jury-share-card-foundation";

const vote = (
  points: JuryShareVote["points"],
  countryId: string,
  displayName: string,
): JuryShareVote => ({
  recipientCountryId: countryId,
  displayName,
  flagAsset: {
    id: `flag-${countryId}`,
    url: `/flags/${countryId}.png`,
    alt: `${displayName} flag`,
  },
  identityVersion: `identity-${countryId}-ssc22`,
  points,
  rank: JURY_SHARE_POINTS.indexOf(points) + 1,
});

const votes = [
  vote(1, "c10", "Country 10"),
  vote(12, "c1", "Vendia"),
  vote(5, "c6", "Country 6"),
  vote(10, "c2", "Hanvør"),
  vote(2, "c9", "Country 9"),
  vote(8, "c3", "Ækâlin"),
  vote(7, "c4", "Country 4"),
  vote(6, "c5", "Country 5"),
  vote(4, "c7", "Country 7"),
  vote(3, "c8", "Country 8"),
] as const;

const projection = (overrides: Partial<JuryShareProjection> = {}): JuryShareProjection => ({
  schemaVersion: 1,
  ballotId: "ballot-1",
  edition: {
    id: "edition-22",
    slug: "ssc-22",
    number: 22,
    name: "Solaris Song Contest 22",
    historicalIdentityVersion: "edition-22-identity-v1",
  },
  show: {
    id: "show-final",
    name: "Grand Final",
    type: "final",
  },
  source: {
    delegationId: "delegation-oland",
    countryId: "oland",
    displayName: "Oland",
    flagAsset: {
      id: "flag-oland",
      url: "/flags/oland.png",
      alt: "Oland flag",
    },
    identityVersion: "oland-ssc22-v1",
  },
  votes,
  result: {
    resultVersionId: "result-v4",
    publishedAt: "2026-10-18T20:00:00Z",
  },
  publication: { shareable: true, reason: null },
  stateVersion: "state-v1",
  serverTime: "2026-10-18T20:01:00Z",
  ...overrides,
});

describe("V3 Jury Share Card foundation", () => {
  it("registers the intended capability contract but keeps product wiring fail-closed", () => {
    expect(V3_JURY_SHARE_CAPABILITY_ID).toBe("results.jury_share_card");
    expect(V3_JURY_SHARE_FOUNDATION).toEqual({
      phase: "foundation",
      uiEnabled: false,
      renderEndpointEnabled: false,
      databaseWritesRequired: false,
    });
  });

  it("locks sharing until every publication condition is satisfied", () => {
    expect(
      resolveJuryShareAvailability({
        ballotExists: true,
        ballotFinal: true,
        resultPublished: false,
        juryBreakdownPublic: true,
      }),
    ).toEqual({ shareable: false, reason: "RESULTS_NOT_PUBLISHED" });

    expect(
      resolveJuryShareAvailability({
        ballotExists: true,
        ballotFinal: true,
        resultPublished: true,
        juryBreakdownPublic: false,
      }),
    ).toEqual({ shareable: false, reason: "JURY_BREAKDOWN_PRIVATE" });

    expect(
      resolveJuryShareAvailability({
        ballotExists: true,
        ballotFinal: true,
        resultPublished: true,
        juryBreakdownPublic: true,
      }),
    ).toEqual({ shareable: true, reason: null });
  });

  it("keeps Default permanently available while Edition and Liquid Glass fail independently", () => {
    expect(
      resolveJuryShareThemes({
        editionConfigured: false,
        editionValid: false,
        liquidGlassSupported: false,
      }),
    ).toEqual([
      { id: "default", state: "available" },
      {
        id: "edition",
        state: "unconfigured",
        reason: "Edition share theme is not configured",
      },
      {
        id: "liquid_glass",
        state: "unsupported",
        reason: "Liquid Glass renderer unavailable",
      },
    ]);
  });

  it("normalizes the canonical 12-to-1 point set and rejects missing or duplicate recipients", () => {
    expect(normalizeJuryShareVotes(votes).map((entry) => entry.points)).toEqual(JURY_SHARE_POINTS);

    expect(() => normalizeJuryShareVotes(votes.slice(0, 9))).toThrow(/Expected 10 jury point rows/);

    const duplicateRecipient = votes.map((entry, index) =>
      index === 1 ? { ...entry, recipientCountryId: votes[0].recipientCountryId } : entry,
    );
    expect(() => normalizeJuryShareVotes(duplicateRecipient)).toThrow(/Duplicate jury recipient/);
  });

  it("builds the fixed Default Story model without edition design contamination", () => {
    const model = buildDefaultJuryShareModel(projection());

    expect(model.width).toBe(1080);
    expect(model.height).toBe(1920);
    expect(model.safeArea).toEqual(JURY_SHARE_TARGETS.story.safeArea);
    expect(model.design).toBe(DEFAULT_JURY_SHARE_DESIGN);
    expect(model.rows.map((row) => row.pointsLabel)).toEqual([
      "12",
      "10",
      "08",
      "07",
      "06",
      "05",
      "04",
      "03",
      "02",
      "01",
    ]);
    expect(model.rows[0].emphasized).toBe(true);
    expect(model.rows.slice(1).every((row) => !row.emphasized)).toBe(true);
    expect(model.footerCountry).toBe("Oland");

    const anotherEdition = buildDefaultJuryShareModel(
      projection({
        edition: {
          id: "edition-23",
          slug: "ssc-23",
          number: 23,
          name: "Solaris Song Contest 23",
          historicalIdentityVersion: "edition-23-identity-v1",
        },
      }),
    );
    expect(anotherEdition.design).toBe(DEFAULT_JURY_SHARE_DESIGN);
    expect(anotherEdition.editionLabel).toBe("Solaris Song Contest 23");
  });

  it("refuses to build even a preview model from unpublished authoritative state", () => {
    expect(() =>
      buildDefaultJuryShareModel(
        projection({ publication: { shareable: false, reason: "RESULTS_NOT_PUBLISHED" } }),
      ),
    ).toThrow(/RESULTS_NOT_PUBLISHED/);
  });

  it("changes render key material when result, historical identity or theme version changes", () => {
    const base = {
      ballotId: "ballot-1",
      resultVersionId: "result-v4",
      sourceIdentityVersion: "oland-ssc22-v1",
      recipientIdentityVersions: [
        { countryId: "vendia", version: "vendia-ssc22-v1" },
        { countryId: "hanvor", version: "hanvor-ssc22-v1" },
      ],
      themeId: "default" as const,
      themeVersion: 1,
      outputTarget: "story" as const,
      format: "png" as const,
    };

    const key = buildJuryShareRenderKeyMaterial(base);
    expect(buildJuryShareRenderKeyMaterial({ ...base, resultVersionId: "result-v5" })).not.toBe(key);
    expect(
      buildJuryShareRenderKeyMaterial({ ...base, sourceIdentityVersion: "oland-ssc22-v2" }),
    ).not.toBe(key);
    expect(buildJuryShareRenderKeyMaterial({ ...base, themeVersion: 2 })).not.toBe(key);
  });

  it("keeps accented historical names intact in text sharing", () => {
    const text = formatJuryShareText(projection());
    expect(text).toContain("12 · Vendia");
    expect(text).toContain("10 · Hanvør");
    expect(text).toContain("8 · Ækâlin");
  });
});
