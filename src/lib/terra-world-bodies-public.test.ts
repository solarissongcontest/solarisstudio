import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mockFrom } }));

import {
  WORLD_BODIES_PAGE_SIZE,
  WORLD_BODY_OFFICE_LIMIT,
  cleanWorldBodySearch,
  decodePublicBodyOffice,
  readPublicBodyOffices,
  decodePublicWorldBody,
  decodePublicWorldInstitution,
  readPublicWorldBody,
  readPublicWorldBodies,
  validWorldSlug,
} from "./terra-world-bodies-public";

const parent = {
  id: "org-1", slug: "guard", short_name: "GUARD", official_name: "Global Union",
  status: "active", public_visibility: "public", auth_user_id: "never-return-this",
};
const organ = {
  id: "body-1", organization_id: "org-1", slug: "gag", name: "General Assembly",
  short_name: "GAG", type: "general_assembly", description: "Public assembly",
  status: "active", visibility: "public", sort_order: 10, private_notes: "never-return-this",
};
function chain(response: Record<string, unknown>) {
  const q = {
    select: vi.fn(), eq: vi.fn(), or: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), range: vi.fn(), limit: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.or.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue(response);
  q.range.mockResolvedValue(response);
  q.limit.mockResolvedValue(response);
  return q;
}

beforeEach(() => mockFrom.mockReset());

describe("TG3 public institution bodies", () => {
  it("accepts stable lowercase slugs but refuses URL controls and unbounded input", () => {
    expect(validWorldSlug("ethics-committee")).toBe(true);
    expect(validWorldSlug("GUARD")).toBe(false);
    expect(validWorldSlug("guard?private=1")).toBe(false);
    expect(validWorldSlug("a".repeat(81))).toBe(false);
  });
  it("rejects unpublished, cross-slug and incomplete institution identities", () => {
    expect(decodePublicWorldInstitution(parent, "guard")?.shortName).toBe("GUARD");
    expect(decodePublicWorldInstitution({ ...parent, public_visibility: "private" }, "guard")).toBeNull();
    expect(decodePublicWorldInstitution(parent, "unity")).toBeNull();
    expect(decodePublicWorldInstitution({ ...parent, official_name: "" }, "guard")).toBeNull();
  });
  it("rejects private, cross-parent, invalid-status and invalid-slug bodies", () => {
    expect(decodePublicWorldBody({ ...organ, visibility: "members" }, "org-1")).toBeNull();
    expect(decodePublicWorldBody({ ...organ, organization_id: "other" }, "org-1")).toBeNull();
    expect(decodePublicWorldBody({ ...organ, status: "draft" }, "org-1")).toBeNull();
    expect(decodePublicWorldBody({ ...organ, slug: "gag/secret" }, "org-1")).toBeNull();
  });
  it("projects only explicitly permitted public fields", () => {
    const row = decodePublicWorldBody(organ, "org-1");
    expect(row?.name).toBe("General Assembly");
    expect(row).not.toHaveProperty("private_notes");
    expect(decodePublicWorldInstitution(parent, "guard")).not.toHaveProperty("auth_user_id");
  });
  it("normalizes Unicode and removes LIKE/filter grammar from submitted body searches", () => {
    expect(cleanWorldBodySearch("  GAG   Assembly  ")).toBe("GAG Assembly");
    expect(cleanWorldBodySearch("Ethics%Committee,secret")).toBe("EthicsCommitteesecret");
    expect(cleanWorldBodySearch("Ålanti → UNITY")).toBe("Ålanti UNITY");
    expect(cleanWorldBodySearch("A".repeat(100))).toHaveLength(64);
  });
  it("searches the entire published body set, never only the current page", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 0, { term: " GAG% ", status: "active" });
    expect(result?.bodies).toHaveLength(1);
    expect(body.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(body.eq).toHaveBeenCalledWith("visibility", "public");
    expect(body.eq).toHaveBeenCalledWith("status", "active");
    expect(body.or).toHaveBeenCalledWith("name.ilike.%GAG%,short_name.ilike.%GAG%");
    expect(body.select).toHaveBeenCalledWith(
      "id,organization_id,slug,name,short_name,type,status,visibility,sort_order",
      { count: "exact" },
    );
    expect(body.range).toHaveBeenCalledWith(0, WORLD_BODIES_PAGE_SIZE - 1);
  });
  it("preserves public-only predicates for historical filtering without search", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [], error: null, count: 0 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 0, { status: "historical" });
    expect(result?.total).toBe(0);
    expect(body.eq).toHaveBeenCalledWith("status", "historical");
    expect(body.or).not.toHaveBeenCalled();
  });
  it("does not make any query for invalid deep links", async () => {
    expect(await readPublicWorldBody("GUARD", "gag")).toBeNull();
    expect(await readPublicWorldBody("guard", "gag/secret")).toBeNull();
    expect(await readPublicWorldBodies("../guard", 0)).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it("does not fetch a body when the parent is private", async () => {
    const org = chain({ data: { ...parent, public_visibility: "private" }, error: null });
    mockFrom.mockReturnValue(org);
    expect(await readPublicWorldBody("guard", "gag")).toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(org.eq).toHaveBeenCalledWith("public_visibility", "public");
  });
  it("reads a body under the exact public parent and publication predicate", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: organ, error: null });
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : body);
    const result = await readPublicWorldBody("guard", "gag");
    expect(result?.body.slug).toBe("gag");
    expect(body.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(body.eq).toHaveBeenCalledWith("slug", "gag");
    expect(body.eq).toHaveBeenCalledWith("visibility", "public");
    expect(result?.body).not.toHaveProperty("private_notes");
  });
  it("never returns a mismatched or unverified body from a successful server response", async () => {
    mockFrom.mockImplementation((name: string) => name === "world_organizations"
      ? chain({ data: parent, error: null })
      : chain({ data: { ...organ, organization_id: "org-2" }, error: null }));
    expect(await readPublicWorldBody("guard", "gag")).toBeNull();
  });
  it("requires a trustworthy exact count and bounded rows for directory pages", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 0);
    expect(result?.total).toBe(1);
    expect(result?.bodies).toHaveLength(1);
    expect(body.range).toHaveBeenCalledWith(0, WORLD_BODIES_PAGE_SIZE - 1);
    expect(body.eq).toHaveBeenCalledWith("visibility", "public");
  });
  it("fails closed for a missing count, duplicate identity or foreign data", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: null });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await expect(readPublicWorldBodies("guard", 0)).rejects.toThrow("verified");
    body.range.mockResolvedValue({ data: [organ, organ], error: null, count: 2 });
    await expect(readPublicWorldBodies("guard", 0)).rejects.toThrow("Conflicting");
    body.range.mockResolvedValue({ data: [{ ...organ, visibility: "private" }], error: null, count: 1 });
    await expect(readPublicWorldBodies("guard", 0)).rejects.toThrow("invalid public identity");
  });
});

describe("TG3 institution body offices", () => {
  const publicParent = {
    id: "org-1", slug: "guard", shortName: "GUARD", officialName: "Global Union", status: "active",
  };
  const publicBody = {
    id: "body-1", organizationId: "org-1", slug: "gag", name: "General Assembly",
    shortName: "GAG", type: "general_assembly", description: null,
    status: "active" as const, sortOrder: 10,
  };
  const office = {
    id: "office-1", organization_id: "org-1", organ_id: "body-1",
    title: "Assembly Chair", office_type: "leadership", active: true,
    holder_user_id: "must-not-leak", current_term: { private: "must-not-leak" },
  };

  it("keeps public office DTOs free from holder/login/term data", () => {
    const row = decodePublicBodyOffice(office, "org-1", "body-1");
    expect(row?.title).toBe("Assembly Chair");
    expect(row).not.toHaveProperty("holder_user_id");
    expect(row).not.toHaveProperty("current_term");
  });

  it("rejects private/mismatched or inactive office identity", () => {
    expect(decodePublicBodyOffice({ ...office, organization_id: "org-2" }, "org-1", "body-1")).toBeNull();
    expect(decodePublicBodyOffice({ ...office, organ_id: "private" }, "org-1", "body-1")).toBeNull();
    expect(decodePublicBodyOffice({ ...office, active: false }, "org-1", "body-1")).toBeNull();
  });

  it("never requests office data on inconsistent public parent and organ", async () => {
    await expect(readPublicBodyOffices(publicParent, { ...publicBody, organizationId: "org-2" }))
      .rejects.toThrow("inconsistent");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries only current organ office definitions and limits the rows", async () => {
    const query = chain({});
    query.limit = vi.fn().mockResolvedValue({ data: [office], error: null });
    mockFrom.mockReturnValue(query);
    const rows = await readPublicBodyOffices(publicParent, publicBody);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("holder_user_id");
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("organ_id", "body-1");
    expect(query.eq).toHaveBeenCalledWith("active", true);
    expect(query.limit).toHaveBeenCalledWith(WORLD_BODY_OFFICE_LIMIT);
    expect(query.select).toHaveBeenCalledWith("id,organization_id,organ_id,title,office_type,active");
  });

  it("fails closed on foreign office payloads or malformed arrays", async () => {
    const query = chain({});
    query.limit = vi.fn().mockResolvedValue({ data: [{ ...office, organ_id: "secret" }], error: null });
    mockFrom.mockReturnValue(query);
    await expect(readPublicBodyOffices(publicParent, publicBody)).rejects.toThrow("invalid public identity");
    query.limit.mockResolvedValue({ data: {}, error: null });
    await expect(readPublicBodyOffices(publicParent, publicBody)).rejects.toThrow("could not be verified");
    query.limit.mockResolvedValue({ data: [office, office], error: null });
    await expect(readPublicBodyOffices(publicParent, publicBody)).rejects.toThrow("Duplicate");
  });
});
