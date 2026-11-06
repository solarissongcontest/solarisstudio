import { beforeEach, describe, expect, it, vi } from "vitest";

const editionId = "00000000-0000-4000-8000-00000000a791";
const fixture = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  privilegedSchema: vi.fn(),
  privilegedFrom: vi.fn(),
}));

// No Supabase client is constructed and this test never contacts hosted data.
vi.mock("@/integrations/supabase/capabilities.server", () => ({
  getSolarisCapabilitiesServer: fixture.getCapabilities,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { schema: fixture.privilegedSchema, from: fixture.privilegedFrom },
}));

import { listJuryIntegrityCasesServer } from "./jury-integrity-admin.server";

beforeEach(() => {
  fixture.getCapabilities.mockReset();
  fixture.privilegedSchema.mockReset();
  fixture.privilegedFrom.mockReset();
});

describe("Jury integrity evidence service-role authorization", () => {
  it("rejects an absent edition before resolving permissions or private reads", async () => {
    await expect(listJuryIntegrityCasesServer("  ")).rejects.toThrow(
      "Jury Integrity requires an explicit edition scope",
    );
    expect(fixture.getCapabilities).not.toHaveBeenCalled();
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it.each(["not-an-edition", "ssc22", "00000000-0000-0000-0000-000000000000"])(
    "rejects malformed edition identifiers before permission or private reads: %s",
    async (id) => {
      await expect(listJuryIntegrityCasesServer(id)).rejects.toThrow(
        "Jury Integrity requires a valid edition id",
      );
      expect(fixture.getCapabilities).not.toHaveBeenCalled();
      expect(fixture.privilegedSchema).not.toHaveBeenCalled();
    },
  );

  it("does not access protected evidence when the identity lookup fails", async () => {
    fixture.getCapabilities.mockRejectedValue(new Error("Not authenticated"));
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow("Not authenticated");
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it.each([
    [[], "integrity.read"],
    [["jury.ballots.read"], "integrity.read"],
    [["integrity.read"], "jury.ballots.read"],
  ])("denies insufficient scope %o before any privileged query", async (capabilities, missing) => {
    fixture.getCapabilities.mockResolvedValue({ userId: "fixture-user", authoritative: true, capabilities });
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow(
      `Solaris capability required: ${missing}`,
    );
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
    expect(fixture.privilegedSchema).not.toHaveBeenCalled();
  });

  it("normalizes edition scope and enters protected reads only after both permissions", async () => {
    fixture.getCapabilities.mockResolvedValue({
      userId: "fixture-user",
      authoritative: true,
      capabilities: ["integrity.read", "jury.ballots.read"],
    });
    fixture.privilegedSchema.mockImplementation(() => {
      expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
      throw new Error("CONTROLLED_PRIVILEGED_READ_REACHED");
    });
    await expect(listJuryIntegrityCasesServer(` ${editionId} `)).rejects.toThrow(
      "CONTROLLED_PRIVILEGED_READ_REACHED",
    );
    expect(fixture.privilegedSchema).toHaveBeenCalledTimes(1);
  });
});

/** A chained PostgREST mock keeps protected readback testing entirely offline. */
function mockProtectedPreflightReadback(response: {
  data: unknown;
  count: unknown;
  error?: { message: string } | null;
}) {
  const preflightQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ ...response, error: response.error ?? null }),
  };
  const preflightFrom = vi.fn().mockReturnValue(preflightQuery);
  fixture.privilegedSchema.mockReturnValue({ from: preflightFrom });
  return { preflightFrom, preflightQuery };
}

function allowBothEvidencePermissions() {
  fixture.getCapabilities.mockResolvedValue({
    userId: "fixture-user",
    authoritative: true,
    capabilities: ["integrity.read", "jury.ballots.read"],
  });
}

describe("Jury integrity bounded canonical evidence completeness", () => {
  it("returns genuinely empty evidence only after an exact zero-row count and a scoped edition lookup", async () => {
    allowBothEvidencePermissions();
    const { preflightFrom, preflightQuery } = mockProtectedPreflightReadback({
      data: [],
      count: 0,
    });
    const editionQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: editionId, edition_number: 22, name: "Fixture Edition" },
        error: null,
      }),
    };
    fixture.privilegedFrom.mockReturnValue(editionQuery);

    const result = await listJuryIntegrityCasesServer(editionId);

    expect(result).toMatchObject({
      editionId,
      cases: [],
      stats: { total: 0, reviewOrHigher: 0, declarationOrHigher: 0, highOrHigher: 0 },
    });
    expect(preflightFrom).toHaveBeenCalledTimes(1);
    expect(preflightFrom).toHaveBeenCalledWith("vote_preflight_checks");
    expect(preflightQuery.select).toHaveBeenCalledWith(
      expect.any(String),
      { count: "exact" },
    );
    expect(preflightQuery.eq).toHaveBeenCalledWith("canonical_edition_id", editionId);
    expect(preflightQuery.eq).toHaveBeenCalledWith("model_version", "jury-integrity-model-v5");
    expect(preflightQuery.limit).toHaveBeenCalledTimes(1);
    expect(preflightQuery.limit).toHaveBeenCalledWith(1000);
    expect(fixture.privilegedFrom).toHaveBeenCalledTimes(1);
    expect(fixture.privilegedFrom).toHaveBeenCalledWith("editions");
    expect(editionQuery.eq).toHaveBeenCalledWith("id", editionId);
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
    expect(fixture.getCapabilities).toHaveBeenCalledWith(editionId);
  });

  it.each([
    { data: [], count: null, reason: "missing count" },
    { data: [], count: 1, reason: "truncated result" },
    { data: [], count: 1001, reason: "more cases than the hard cap" },
    { data: [{}], count: 2, reason: "incomplete nonempty readback" },
    { data: null, count: 0, reason: "invalid canonical row array" },
  ])("blocks $reason before any related entity queries", async ({ data, count }) => {
    allowBothEvidencePermissions();
    const { preflightQuery } = mockProtectedPreflightReadback({ data, count });
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow(
      /Jury integrity evidence is incomplete|Jury Integrity returned no valid protected preflight evidence/,
    );
    expect(preflightQuery.limit).toHaveBeenCalledTimes(1);
    expect(preflightQuery.limit).toHaveBeenCalledWith(1000);
    expect(fixture.privilegedFrom).not.toHaveBeenCalled();
  });

  it("propagates a canonical protected-query error rather than presenting an empty evidence state", async () => {
    allowBothEvidencePermissions();
    mockProtectedPreflightReadback({
      data: [],
      count: 0,
      error: { message: "CONTROLLED_PROTECTED_QUERY_FAILED" },
    });
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow(
      "CONTROLLED_PROTECTED_QUERY_FAILED",
    );
    expect(fixture.privilegedFrom).not.toHaveBeenCalled();
  });
});

describe("Jury integrity full authorized private evidence projection", () => {
  const showId = "00000000-0000-4000-8000-00000000b791";
  const targetCountryId = "00000000-0000-4000-8000-00000000c791";

  function validPreflight() {
    return {
      id: "00000000-0000-4000-8000-00000000d791",
      show_id: showId,
      canonical_edition_id: editionId,
      country_code: "TST",
      hod_person_id: null,
      risk_score: 55,
      relationship_risk: 40,
      confidence: 70,
      intervention_level: "review",
      model_version: "jury-integrity-model-v5",
      admin_evidence: {
        juryIndependence: {
          modelVersion: "jury-integrity-model-v5",
          risk: 55,
          confidence: 70,
          independenceScore: 45,
          peerDeviationRisk: 25,
          peerBallots: 3,
          evidenceFamilies: ["historical_relationship", "peer_deviation"],
          targets: [{
            targetCountryId,
            score: 12,
            expectedNormalizedScore: 0.5,
            positiveDeviation: 0.5,
            zScore: 2.25,
            risk: 60,
          }],
        },
      },
      attested_at: null,
      submitted_at: null,
      created_at: "2026-11-06T12:00:00Z",
    };
  }

  it("returns scoped v5 risk and private target scores only after both permissions and complete readback", async () => {
    allowBothEvidencePermissions();
    const { preflightQuery } = mockProtectedPreflightReadback({
      data: [validPreflight()],
      count: 1,
    });

    const showsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: showId, name: "Fixture Semi-final", edition_id: editionId }],
        error: null,
      }),
    };
    const editionQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: editionId, edition_number: 22, name: "Fixture Edition" },
        error: null,
      }),
    };
    const countriesQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: targetCountryId, name: "Fixture Country", short_code: "FCT" }],
        error: null,
      }),
    };
    fixture.privilegedFrom.mockImplementation((table: string) => {
      if (table === "shows") return showsQuery;
      if (table === "editions") return editionQuery;
      if (table === "countries") return countriesQuery;
      throw new Error(`Unexpected protected lookup: ${table}`);
    });

    const result = await listJuryIntegrityCasesServer(editionId);

    expect(result.stats).toEqual({
      total: 1, reviewOrHigher: 1, declarationOrHigher: 0, highOrHigher: 0,
    });
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({
      editionId,
      showId,
      showName: "Fixture Semi-final",
      countryCode: "TST",
      risk: 55,
      confidence: 70,
      relationshipRisk: 40,
      peerBallots: 3,
      targets: [{
        targetCountryId,
        targetName: "Fixture Country",
        score: 12,
        expectedNormalizedScore: 0.5,
        positiveDeviation: 0.5,
        zScore: 2.25,
        risk: 60,
      }],
    });
    expect(preflightQuery.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(preflightQuery.limit).toHaveBeenCalledWith(1000);
    expect(showsQuery.eq).toHaveBeenCalledWith("edition_id", editionId);
    expect(showsQuery.in).toHaveBeenCalledWith("id", [showId]);
    expect(editionQuery.eq).toHaveBeenCalledWith("id", editionId);
    expect(countriesQuery.in).toHaveBeenCalledWith("id", [targetCountryId]);
    expect(fixture.privilegedFrom).toHaveBeenCalledTimes(3);
    expect(fixture.getCapabilities).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched embedded risk before querying show or country metadata", async () => {
    allowBothEvidencePermissions();
    const stale = validPreflight();
    stale.admin_evidence.juryIndependence.risk = 50;
    mockProtectedPreflightReadback({ data: [stale], count: 1 });
    await expect(listJuryIntegrityCasesServer(editionId)).rejects.toThrow(
      "Jury integrity evidence disagrees with the canonical preflight",
    );
    expect(fixture.privilegedFrom).not.toHaveBeenCalled();
  });
});
