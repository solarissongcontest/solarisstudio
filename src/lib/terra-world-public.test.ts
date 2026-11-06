import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    range: vi.fn(),
  };
  return { chain, from: vi.fn(), rpc: vi.fn() };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import {
  WORLD_DIRECTORY_PAGE_SIZE,
  WORLD_PUBLIC_ROLLOUT_KEY,
  cleanWorldSearch,
  currentWorldMemberships,
  fetchWorldDirectory,
  fetchFeaturedWorldOrganizations,
  fetchWorldPublicEnabled,
  fetchWorldProjection,
  parseWorldDirectoryRows,
  parseWorldProjection,
} from "./terra-world-public";

const organization = {
  id: "organization-id", slug: "guard",
  officialName: "Global Union for Allied Resilience and Defence",
  shortName: "GUARD", type: "international_union", status: "active",
  description: "International institution",
};

const row = {
  id: organization.id,
  slug: organization.slug,
  official_name: organization.officialName,
  short_name: organization.shortName,
  type: organization.type, status: organization.status,
  description: organization.description,
  public_visibility: "public",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.chain).forEach((fn) => fn.mockReturnValue(mocks.chain));
  mocks.from.mockReturnValue(mocks.chain);
  mocks.chain.range.mockResolvedValue({ data: [row], count: 1, error: null });
  mocks.rpc.mockResolvedValue({ data: { organization, organs: [], memberships: [], offices: [] }, error: null });
});

describe("TG3 world publication-safe projections", () => {
  it("is unavailable until the canonical rollout RPC explicitly returns true", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(fetchWorldPublicEnabled()).resolves.toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
      p_key: WORLD_PUBLIC_ROLLOUT_KEY,
      p_edition_id: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(fetchWorldPublicEnabled()).resolves.toBe(true);
  });

  it("fails closed rather than assuming rollout is enabled on a network error", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    await expect(fetchWorldPublicEnabled()).rejects.toThrow("World availability cannot be verified");
  });

  it("reads featured GUARD/UNITY by stable slug independently of directory pagination", async () => {
    mocks.chain.order.mockResolvedValueOnce({ data: [row, { ...row, slug: "secret", public_visibility: "private" }], error: null });
    const featured = await fetchFeaturedWorldOrganizations();
    expect(mocks.chain.in).toHaveBeenCalledWith("slug", ["guard", "unity"]);
    expect(mocks.chain.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(featured.map((item) => item.slug)).toEqual(["guard"]);
    expect(mocks.chain.range).not.toHaveBeenCalled();
  });


  it("excludes unrecognized and unrelated featured institutions even when upstream leaks rows", async () => {
    mocks.chain.order.mockResolvedValueOnce({
      data: [
        row,
        { ...row, id: "secret-proposal", slug: "unity", status: "proposed" },
        { ...row, id: "unrelated", slug: "other", status: "active" },
      ],
      error: null,
    });
    const featured = await fetchFeaturedWorldOrganizations();
    expect(mocks.chain.in).toHaveBeenCalledWith("status",
      ["recognized", "active", "suspended", "historical", "dissolved"]);
    expect(featured.map((item) => item.slug)).toEqual(["guard"]);
  });

  it("rejects unpublished directory records even if a broken upstream reader returned them", () => {
    expect(parseWorldDirectoryRows([row, { ...row, slug: "secret", public_visibility: "private" }]))
      .toHaveLength(1);
  });

  it("rejects invalid public identity instead of producing navigable broken links", () => {
    expect(parseWorldDirectoryRows([{ ...row, slug: "../private" }])).toEqual([]);
  });

  it("rejects a projection from the wrong organization", () => {
    expect(parseWorldProjection({ organization, organs: [] }, "unity")).toBeNull();
  });

  it("never reconstructs private proxy/auth fields from a public projection", () => {
    const projection = parseWorldProjection({
      organization: { ...organization, userId: "private" },
      organs: [{ id: "gag", slug: "gag", name: "General Assembly of GUARD", type: "assembly", status: "active", internalNotes: "private" }],
      memberships: [{ id: "member-a", countryId: "a", status: "member", membershipType: "member", endedAt: null, userId: "secret" }],
      offices: [{ id: "chair", title: "Chairperson", currentTerm: null, secretVoter: "private" }],
      proxies: [{ userId: "private" }],
    }, "guard");
    expect(projection?.organization).not.toHaveProperty("userId");
    expect(projection?.organs[0]).not.toHaveProperty("internalNotes");
    expect(projection?.memberships[0]).not.toHaveProperty("userId");
    expect(projection?.offices[0]).not.toHaveProperty("secretVoter");
    expect(projection).not.toHaveProperty("proxies");
  });

  it("exposes canonical public representative names but strips private identity and access details", () => {
    const projection = parseWorldProjection({
      organization, organs: [], memberships: [], offices: [],
      representatives: [
        { id: "rep-a", countryId: "country-a", displayName: "Delegation A",
          role: "representative", votingAuthority: true, endsAt: null,
          userId: "private", personId: "private", votingToken: "private" },
        { id: "rep-b", countryId: "country-b", displayName: "Former delegate",
          role: "representative", votingAuthority: false, endsAt: "2025-01-01" },
      ],
    }, "guard");
    expect(projection?.representatives).toHaveLength(2);
    expect(projection?.representatives[0]).toEqual({
      id: "rep-a", countryId: "country-a", displayName: "Delegation A",
      role: "representative", votingAuthority: true, endsAt: null,
    });
    expect(projection?.representatives[0]).not.toHaveProperty("votingToken");
    expect(projection?.representatives[0]).not.toHaveProperty("userId");
    expect(projection?.representatives[0]).not.toHaveProperty("personId");
  });

  it("counts current membership statuses but not concluded historical terms", () => {
    const projection = parseWorldProjection({
      organization, organs: [], offices: [],
      memberships: [
        { id: "a", countryId: "a", membershipType: "member", status: "member", endedAt: null },
        { id: "b", countryId: "b", membershipType: "member", status: "suspended", endedAt: null },
        { id: "c", countryId: "c", membershipType: "member", status: "former", endedAt: "2026-01-01" },
        { id: "d", countryId: "d", membershipType: "member", status: "former", endedAt: null },
      ],
    }, "guard");
    expect(currentWorldMemberships(projection!).map((member) => member.countryId)).toEqual(["a", "b"]);
  });

  it("does not invent an officeholder where a term is not active", () => {
    const projection = parseWorldProjection({
      organization, organs: [], memberships: [],
      offices: [{ id: "chair", title: "Chairperson", currentTerm: { holderDisplayName: "Former", status: "concluded" } }],
    }, "guard");
    expect(projection?.offices[0].currentTerm).toBeNull();
  });

  it("removes PostgREST filter delimiters and limits search length", () => {
    expect(cleanWorldSearch(" GUARD),status.eq.private% ")).toBe("GUARDstatuseqprivate");
    expect(cleanWorldSearch("a".repeat(200))).toHaveLength(64);
  });

  it("requests only public organizations and bounded pages", async () => {
    const result = await fetchWorldDirectory({ term: "", filter: "all", page: 2 });
    expect(mocks.from).toHaveBeenCalledWith("world_organizations");
    expect(mocks.chain.select).toHaveBeenCalledWith(
      "id,slug,official_name,short_name,type,description,status,public_visibility", { count: "exact" });
    expect(mocks.chain.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(mocks.chain.range).toHaveBeenCalledWith(2 * WORLD_DIRECTORY_PAGE_SIZE, 3 * WORLD_DIRECTORY_PAGE_SIZE - 1);
    expect(result.organizations).toHaveLength(1);
  });

  it("rejects missing count proof instead of displaying a false zero", async () => {
    mocks.chain.range.mockResolvedValueOnce({ data: [row], count: null, error: null });
    await expect(fetchWorldDirectory({ term: "", filter: "all", page: 0 }))
      .rejects.toThrow("count could not be verified");
  });

  it("filters current state without broadening public visibility", async () => {
    await fetchWorldDirectory({ term: "", filter: "current", page: 0 });
    expect(mocks.chain.in).toHaveBeenCalledWith("status", ["active", "recognized", "suspended"]);
    expect(mocks.chain.eq).toHaveBeenCalledWith("public_visibility", "public");
  });

  it("does not allow a search expression to inject other PostgREST filters", async () => {
    await fetchWorldDirectory({ term: "GUARD),status.eq.private%", filter: "historical", page: -4 });
    expect(mocks.chain.or).toHaveBeenCalledWith(
      "official_name.ilike.%GUARDstatuseqprivate%,short_name.ilike.%GUARDstatuseqprivate%");
    expect(mocks.chain.in).toHaveBeenCalledWith("status", ["historical", "dissolved"]);
    expect(mocks.chain.range).toHaveBeenCalledWith(0, WORLD_DIRECTORY_PAGE_SIZE - 1);
  });

  it("never queries the private projection for an invalid slug", async () => {
    expect(await fetchWorldProjection("../guard")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("consumes the sole TG2 publication-authoritative public RPC", async () => {
    const result = await fetchWorldProjection("guard");
    expect(result?.organization.shortName).toBe("GUARD");
    expect(mocks.rpc).toHaveBeenCalledWith("world_organization_projection_v1", { p_slug: "guard" });
  });

  it("fails closed on read errors without falling back to production or local fake data", async () => {
    mocks.chain.range.mockResolvedValue({ data: null, count: null, error: { message: "unavailable" } });
    await expect(fetchWorldDirectory({ term: "", filter: "all", page: 0 })).rejects.toThrow("temporarily unavailable");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await expect(fetchWorldProjection("guard")).rejects.toThrow("cannot be loaded");
  });
});
