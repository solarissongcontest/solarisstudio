import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mockFrom } }));

import {
  WORLD_BODIES_PAGE_SIZE,
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
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), range: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue(response);
  q.range.mockResolvedValue(response);
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
