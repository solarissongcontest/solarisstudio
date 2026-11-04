import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORLD_PAGE_SIZE,
  canonicalWorldSlug,
  currentWorldMemberships,
  currentWorldRepresentatives,
  loadWorldCountryIdentities,
  loadWorldOrganizationDetail,
  loadWorldOrganizationPage,
  parseWorldOrganizationProjection,
  worldSearchTerm,
  type WorldOrganizationDetail,
} from "./v3-world-public";

const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));

const publicOrganization = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "guard",
  officialName: "Global Union for Allied Resilience and Defence",
  shortName: "GUARD",
  type: "international_union",
  status: "active",
  description: "Public institution",
};
const publicRow = {
  ...publicOrganization,
  official_name: publicOrganization.officialName,
  short_name: publicOrganization.shortName,
};

function queryMock() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  api.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  api.from.mockReset();
  api.rpc.mockReset();
});

describe("TG3 public institution identity", () => {
  it("only accepts bounded canonical slugs", () => {
    expect(canonicalWorldSlug(" GUARD ")).toBe("guard");
    expect(canonicalWorldSlug("unity")).toBe("unity");
    expect(canonicalWorldSlug("guard/or/not-public")).toBeNull();
    expect(canonicalWorldSlug("guard--admin")).toBeNull();
    expect(canonicalWorldSlug("A".repeat(81))).toBeNull();
  });

  it("refuses PostgREST operator syntax and wildcard injection", () => {
    expect(worldSearchTerm("Global Union")).toBe("Global Union");
    expect(worldSearchTerm("GUARD*,status.eq.private")).toBe("");
    expect(worldSearchTerm("%")).toBe("");
    expect(worldSearchTerm("UNITY")).toBe("UNITY");
  });

  it("rejects inconsistent or invalid public projection identity", () => {
    const valid = { organization: publicOrganization, organs: [], memberships: [], offices: [], representatives: [] };
    expect(parseWorldOrganizationProjection(valid, "GUARD")?.organization.shortName).toBe("GUARD");
    expect(parseWorldOrganizationProjection(valid, "unity")).toBeNull();
    expect(parseWorldOrganizationProjection({ ...valid, organization: { ...publicOrganization, status: "leaked" } }, "guard")).toBeNull();
    expect(parseWorldOrganizationProjection({ organization: null }, "guard")).toBeNull();
  });

  it("does not confuse expired membership or delegates with current ones", () => {
    const detail = {
      organization: publicOrganization,
      organs: [],
      offices: [],
      memberships: [
        { id: "a", countryId: "a", membershipType: "member", status: "member", joinedAt: null, endedAt: null },
        { id: "b", countryId: "b", membershipType: "member", status: "suspended", joinedAt: null, endedAt: null },
        { id: "c", countryId: "c", membershipType: "member", status: "former", joinedAt: null, endedAt: "2025-01-01" },
      ],
      representatives: [
        { id: "r1", countryId: "a", role: "representative", displayName: "Member A", votingAuthority: true, endsAt: null },
        { id: "r2", countryId: "b", role: "representative", displayName: "Former B", votingAuthority: true, endsAt: "2025-01-01" },
        { id: "r3", countryId: "c", role: "observer", displayName: "Observer C", votingAuthority: false, endsAt: null },
      ],
    } satisfies WorldOrganizationDetail;
    expect(currentWorldMemberships(detail).map((member) => member.id)).toEqual(["a", "b"]);
    expect(currentWorldRepresentatives(detail).map((person) => person.id)).toEqual(["r1"]);
  });
});

describe("TG3 bounded world reads", () => {
  it("enforces public visibility, one-page-plus-one pagination and safe directory search", async () => {
    const query = queryMock();
    query.range.mockResolvedValue({ data: [publicRow], error: null });
    const result = await loadWorldOrganizationPage("GUARD", "active", 1);
    expect(result.organizations).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(api.from).toHaveBeenCalledWith("world_organizations");
    expect(query.select).toHaveBeenCalledWith("id,slug,official_name,short_name,type,description,status");
    expect(query.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.or).toHaveBeenCalledWith("official_name.ilike.*GUARD*,short_name.ilike.*GUARD*");
    expect(query.range).toHaveBeenCalledWith(WORLD_PAGE_SIZE, WORLD_PAGE_SIZE * 2);
  });

  it("pages without bulk fetch, and never widens a malicious search", async () => {
    const query = queryMock();
    query.range.mockResolvedValue({ data: Array.from({ length: WORLD_PAGE_SIZE + 1 }, () => publicRow), error: null });
    const page = await loadWorldOrganizationPage("", "all", 0);
    expect(page.organizations).toHaveLength(WORLD_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(query.range).toHaveBeenCalledWith(0, WORLD_PAGE_SIZE);
    api.from.mockClear();
    const rejected = await loadWorldOrganizationPage("x,public_visibility.eq.private", "all", 0);
    expect(rejected).toEqual({ organizations: [], hasMore: false });
    expect(api.from).not.toHaveBeenCalled();
    await expect(loadWorldOrganizationPage("", "all", -1)).rejects.toThrow("Invalid directory page");
  });

  it("fails closed on malformed rows or read failures", async () => {
    const query = queryMock();
    query.range.mockResolvedValueOnce({ data: [{ ...publicRow, slug: "../secret" }], error: null });
    await expect(loadWorldOrganizationPage("", "all", 0)).rejects.toThrow("Invalid world directory projection");
    query.range.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(loadWorldOrganizationPage("", "all", 0)).rejects.toThrow("World directory unavailable");
  });

  it("uses only canonical public organization projection and never queries an invalid slug", async () => {
    expect(await loadWorldOrganizationDetail("../private")).toBeNull();
    expect(api.rpc).not.toHaveBeenCalled();
    api.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadWorldOrganizationDetail("unknown")).toBeNull();
    expect(api.rpc).toHaveBeenCalledWith("world_organization_projection_v1", { p_slug: "unknown" });
    api.rpc.mockResolvedValueOnce({ data: { organization: publicOrganization, organs: [], offices: [], memberships: [], representatives: [] }, error: null });
    expect((await loadWorldOrganizationDetail("guard"))?.organization.slug).toBe("guard");
    api.rpc.mockResolvedValueOnce({ data: { organization: { ...publicOrganization, slug: "unity" } }, error: null });
    await expect(loadWorldOrganizationDetail("guard")).rejects.toThrow("Invalid public organization projection");
  });

  it("fetches only requested country labels and does not fetch when no IDs exist", async () => {
    expect(await loadWorldCountryIdentities([])).toEqual([]);
    expect(api.from).not.toHaveBeenCalled();
    const query = queryMock();
    query.limit.mockResolvedValue({ data: [], error: null });
    const id = "00000000-0000-4000-8000-000000000001";
    expect(await loadWorldCountryIdentities([id, id, "bad id"])).toEqual([]);
    expect(query.in).toHaveBeenCalledWith("id", [id]);
    expect(query.limit).toHaveBeenCalledWith(100);
  });
});
