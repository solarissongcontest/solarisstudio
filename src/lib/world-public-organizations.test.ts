import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  in: vi.fn(),
  limit: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from, rpc: db.rpc },
}));

import {
  currentWorldLeadership,
  currentWorldMemberships,
  getPublicWorldDirectory,
  getPublicWorldMemberCountries,
  getPublicWorldOrganization,
  normalizeWorldSearch,
  parsePublicWorldProjection,
  WORLD_DIRECTORY_PAGE_SIZE,
} from "./world-public-organizations";

const ID_A = "00000000-0000-4000-8000-000000000001";
const ID_B = "00000000-0000-4000-8000-000000000002";
const ID_C = "00000000-0000-4000-8000-000000000003";

const publicRow = {
  id: ID_A,
  slug: "guard",
  official_name: "GUARD",
  short_name: "GUARD",
  type: "international_organization",
  description: "Official organization",
  status: "active",
  public_visibility: "public",
};

function projection() {
  return {
    organization: {
      id: ID_A,
      slug: "guard",
      officialName: "GUARD",
      shortName: "GUARD",
      type: "international_organization",
      description: "Official organization",
      status: "active",
      emblemUrl: null,
      bannerUrl: null,
      revision: 1,
    },
    organs: [],
    memberships: [
      { id: ID_A, countryId: ID_B, membershipType: "member", status: "member", joinedAt: "2026-01-01T00:00:00Z", endedAt: null },
      { id: ID_B, countryId: ID_C, membershipType: "member", status: "former", joinedAt: "2025-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:00Z" },
    ],
    offices: [
      { id: ID_A, title: "Chairperson", active: true, currentTerm: { id: ID_C, holderDisplayName: "Published person", representedCountryId: null, startEditionId: null, endEditionId: null, status: "active" } },
      { id: ID_B, title: "Deputy", active: true, currentTerm: null },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  const builder = {
    select: db.select,
    eq: db.eq,
    or: db.or,
    order: db.order,
    range: db.range,
    in: db.in,
    limit: db.limit,
  };
  for (const operation of [db.select, db.eq, db.or, db.order, db.in]) {
    operation.mockReturnValue(builder);
  }
  db.from.mockReturnValue(builder);
  db.range.mockResolvedValue({ data: [publicRow], count: 1, error: null });
  db.limit.mockResolvedValue({ data: [{ id: ID_B, name: "Example country", flag_image: null }], error: null });
  db.rpc.mockResolvedValue({ data: projection(), error: null });
});

describe("Terra Solaris public organization discovery", () => {
  it("bounds searches and removes PostgREST expression punctuation", () => {
    expect(normalizeWorldSearch("GUARD"),).toBe("GUARD");
    expect(normalizeWorldSearch("a,b).status.eq.private(,c%_")).toBe("a b status eq private c");
    expect(normalizeWorldSearch("øland")).toBe("øland");
    expect(normalizeWorldSearch("A".repeat(200))).toHaveLength(64);
  });

  it("only queries public rows with a bounded page and matching status", async () => {
    const result = await getPublicWorldDirectory({ search: "GUARD", status: "active", page: 2 });
    expect(result.total).toBe(1);
    expect(result.organizations[0].short_name).toBe("GUARD");
    expect(db.from).toHaveBeenCalledWith("world_organizations");
    expect(db.select).toHaveBeenCalledWith(
      "id,slug,official_name,short_name,type,description,status,public_visibility",
      { count: "exact" },
    );
    expect(db.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(db.eq).toHaveBeenCalledWith("status", "active");
    expect(db.or).toHaveBeenCalledWith("official_name.ilike.%GUARD%,short_name.ilike.%GUARD%");
    expect(db.range).toHaveBeenCalledWith(2 * WORLD_DIRECTORY_PAGE_SIZE, 3 * WORLD_DIRECTORY_PAGE_SIZE - 1);
  });

  it("does not send malformed punctuation-only searches to PostgREST", async () => {
    expect(await getPublicWorldDirectory({ search: "),%_(", status: "all", page: 0 }))
      .toEqual({ organizations: [], total: 0 });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects nonpublic directory rows even if a backend regression exposes one", async () => {
    db.range.mockResolvedValueOnce({
      data: [{ ...publicRow, public_visibility: "private" }],
      count: 1,
      error: null,
    });
    await expect(getPublicWorldDirectory({ search: "", status: "all", page: 0 })).rejects.toThrow();
  });

  it("uses the canonical public projection, not direct private join tables", async () => {
    const result = await getPublicWorldOrganization("guard");
    expect(result?.organization.shortName).toBe("GUARD");
    expect(db.rpc).toHaveBeenCalledWith("world_organization_projection_v1", { p_slug: "guard" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("does not query an invalid detail slug or render private/null projections", async () => {
    expect(await getPublicWorldOrganization("guard,status.eq.private")).toBeNull();
    expect(db.rpc).not.toHaveBeenCalled();
    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await getPublicWorldOrganization("unpublished-org")).toBeNull();
  });

  it("rejects malformed canonical projection values", () => {
    expect(() => parsePublicWorldProjection({ organization: { shortName: "fake" }, memberships: [] })).toThrow();
  });

  it("keeps current membership separate from former history and never invents leaders", () => {
    const parsed = parsePublicWorldProjection(projection());
    expect(currentWorldMemberships(parsed).map((item) => item.countryId)).toEqual([ID_B]);
    expect(currentWorldLeadership(parsed).map((item) => item.title)).toEqual(["Chairperson"]);
  });

  it("loads only listed current country identities instead of the entire countries table", async () => {
    const result = await getPublicWorldMemberCountries(parsePublicWorldProjection(projection()));
    expect(result[ID_B].name).toBe("Example country");
    expect(result[ID_C]).toBeUndefined();
    expect(db.from).toHaveBeenCalledWith("countries");
    expect(db.select).toHaveBeenCalledWith("id,name,flag_image");
    expect(db.in).toHaveBeenCalledWith("id", [ID_B]);
    expect(db.limit).toHaveBeenCalledWith(1);
  });

  it("fails closed on database errors", async () => {
    db.range.mockResolvedValueOnce({ data: null, count: null, error: { message: "Unavailable" } });
    await expect(getPublicWorldDirectory({ search: "", status: "all", page: 0 })).rejects.toThrow("Unavailable");
  });
});
