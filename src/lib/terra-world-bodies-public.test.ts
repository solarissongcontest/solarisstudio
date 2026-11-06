import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mockFrom } }));

import {
  WORLD_BODIES_PAGE_SIZE,
  WORLD_BODIES_MAX_PAGE,
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
    select: vi.fn(), eq: vi.fn(), or: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(), range: vi.fn(), limit: vi.fn(),
    // A HEAD-only count reads the PostgREST builder directly (no .range).
    then: vi.fn((resolve: (result: Record<string, unknown>) => unknown,
      reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject)),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.or.mockReturnValue(q);
  q.abortSignal.mockReturnValue(q);
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
  it("requires a public parent in the same exact directory query, even for private managers", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 0);
    expect(result?.bodies).toHaveLength(1);
    expect(body.eq).toHaveBeenCalledWith("world_organizations.public_visibility", "public");
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
      "id,organization_id,slug,name,short_name,type,status,visibility,sort_order,world_organizations!inner(id)",
      { count: "exact" },
    );
    expect(body.order).toHaveBeenCalledWith("slug", { ascending: true });
    expect(body.range).toHaveBeenCalledWith(0, WORLD_BODIES_PAGE_SIZE - 1);
  });
  it("passes the caller's cancellation signal to the bounded public directory request", async () => {
    const controller = new AbortController();
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await readPublicWorldBodies("guard", 0, { signal: controller.signal });
    expect(body.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
  it("passes the same cancellation signal to an exceptional public-only recount", async () => {
    const controller = new AbortController();
    const org = chain({ data: parent, error: null });
    const outOfRange = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: [], error: null, count: 0 });
    let numberOfOrganQueries = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org :
      ++numberOfOrganQueries === 1 ? outOfRange : recount);
    await readPublicWorldBodies("guard", 1, { signal: controller.signal });
    expect(outOfRange.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(recount.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(numberOfOrganQueries).toBe(2);
  });
  it("includes inactive institutions' public bodies in the exact-status directory", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [{ ...organ, status: "inactive" }], error: null, count: 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const rows = await readPublicWorldBodies("guard", 0, { status: "inactive" });
    expect(rows?.bodies[0]?.status).toBe("inactive");
    expect(body.eq).toHaveBeenCalledWith("status", "inactive");
    expect(body.eq).toHaveBeenCalledWith("visibility", "public");
  });
  it("uses the same inactive-publication predicates when recounting a withdrawn page", async () => {
    const org = chain({ data: parent, error: null });
    const expiredPage = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: [{ id: "body-1" }], error: null, count: 1 });
    let bodyRequests = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : ++bodyRequests === 1 ? expiredPage : recount);
    const result = await readPublicWorldBodies("guard", 1, { status: "inactive" });
    expect(result?.total).toBe(1);
    expect(recount.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(recount.eq).toHaveBeenCalledWith("visibility", "public");
    expect(recount.eq).toHaveBeenCalledWith("status", "inactive");
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
  it("passes cancellation through the public parent lookup and body detail lookup", async () => {
    const controller = new AbortController();
    const org = chain({ data: parent, error: null });
    const body = chain({ data: organ, error: null });
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : body);
    const result = await readPublicWorldBody("guard", "gag", controller.signal);
    expect(result?.body.slug).toBe("gag");
    expect(org.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(body.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
  it("requires a public parent in the exact body-detail query", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: organ, error: null });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await readPublicWorldBody("guard", "gag");
    expect(body.select).toHaveBeenCalledWith(
      "id,organization_id,slug,name,short_name,type,description,status,visibility,sort_order,world_organizations!inner(id)",
    );
    expect(body.eq).toHaveBeenCalledWith("world_organizations.public_visibility", "public");
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
  it("clamps large page numbers to the public query ceiling", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [], error: null, count: 0 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", Number.MAX_SAFE_INTEGER);
    expect(result?.page).toBe(WORLD_BODIES_MAX_PAGE);
    expect(body.range).toHaveBeenCalledWith(
      WORLD_BODIES_MAX_PAGE * WORLD_BODIES_PAGE_SIZE,
      (WORLD_BODIES_MAX_PAGE + 1) * WORLD_BODIES_PAGE_SIZE - 1,
    );
  });
  it("recovers from an out-of-range PostgREST 416 using one public-only recount", async () => {
    const org = chain({ data: parent, error: null });
    const expiredPage = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: [{ id: "body-1" }], error: null, count: 4 });
    let organQueries = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : ++organQueries === 1 ? expiredPage : recount);
    const response = await readPublicWorldBodies("guard", 1, { term: "General", status: "active" });
    expect(response?.bodies).toEqual([]);
    expect(response?.total).toBe(4);
    expect(organQueries).toBe(2);
    expect(recount.select).toHaveBeenCalledWith("id,world_organizations!inner(id)", { count: "exact", head: true });
    expect(recount.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(recount.eq).toHaveBeenCalledWith("visibility", "public");
    expect(recount.eq).toHaveBeenCalledWith("status", "active");
    expect(recount.or).toHaveBeenCalledWith("name.ilike.%General%,short_name.ilike.%General%");
    expect(recount.range).not.toHaveBeenCalled();
    expect(recount.then).toHaveBeenCalled();
  });
  it("recovers when all published bodies have disappeared without requesting a nonexistent first row", async () => {
    const org = chain({ data: parent, error: null });
    const vanished = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: null, error: null, count: 0 });
    let organQueries = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : ++organQueries === 1 ? vanished : recount);
    const response = await readPublicWorldBodies("guard", 1);
    expect(response?.total).toBe(0);
    expect(response?.bodies).toEqual([]);
    expect(recount.select).toHaveBeenCalledWith("id,world_organizations!inner(id)", { count: "exact", head: true });
    expect(recount.range).not.toHaveBeenCalled();
    expect(recount.then).toHaveBeenCalled();
    expect(organQueries).toBe(2);
  });
  it("fails closed when the HEAD-only count cannot be verified", async () => {
    const org = chain({ data: parent, error: null });
    const vanished = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: null, error: null, count: null });
    let organQueries = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : ++organQueries === 1 ? vanished : recount);
    await expect(readPublicWorldBodies("guard", 1)).rejects.toThrow("could not be verified");
    expect(recount.select).toHaveBeenCalledWith("id,world_organizations!inner(id)", { count: "exact", head: true });
  });
  it("fails closed if a PostgREST 416 recount leaves the requested page in range", async () => {
    const org = chain({ data: parent, error: null });
    const expiredPage = chain({ data: null, error: { code: "PGRST103" }, count: null });
    const recount = chain({ data: [{ id: "body-1" }], error: null, count: 25 });
    let organQueries = 0;
    mockFrom.mockImplementation((name: string) =>
      name === "world_organizations" ? org : ++organQueries === 1 ? expiredPage : recount);
    await expect(readPublicWorldBodies("guard", 1)).rejects.toThrow("could not be verified");
    expect(organQueries).toBe(2);
  });
  it("does not attempt to recover a different database error as an expired page", async () => {
    const org = chain({ data: parent, error: null });
    const blocked = chain({ data: null, error: { code: "PGRST301" }, count: null });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : blocked);
    await expect(readPublicWorldBodies("guard", 1)).rejects.toThrow("could not be loaded");
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
  it("treats a page emptied by publication changes as a verified empty page", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [], error: null, count: 4 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 1);
    expect(result?.page).toBe(1);
    expect(result?.total).toBe(4);
    expect(result?.bodies).toEqual([]);
    expect(body.range).toHaveBeenCalledWith(WORLD_BODIES_PAGE_SIZE, WORLD_BODIES_PAGE_SIZE * 2 - 1);
  });
  it("rejects an incomplete nonfinal public directory page despite a valid exact count", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 30 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await expect(readPublicWorldBodies("guard", 0)).rejects.toThrow("could not be verified");
    expect(body.range).toHaveBeenCalledWith(0, WORLD_BODIES_PAGE_SIZE - 1);
  });
  it("accepts a correctly sized final public directory page", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: WORLD_BODIES_PAGE_SIZE + 1 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    const result = await readPublicWorldBodies("guard", 1);
    expect(result?.total).toBe(WORLD_BODIES_PAGE_SIZE + 1);
    expect(result?.bodies).toHaveLength(1);
  });
  it("fails closed when an in-range page is silently missing records", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [], error: null, count: 3 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await expect(readPublicWorldBodies("guard", 0)).rejects.toThrow("could not be verified");
  });
  it("rejects a stale page whose returned row exceeds its verified count", async () => {
    const org = chain({ data: parent, error: null });
    const body = chain({ data: [organ], error: null, count: 3 });
    mockFrom.mockImplementation((name: string) => name === "world_organizations" ? org : body);
    await expect(readPublicWorldBodies("guard", 1)).rejects.toThrow("could not be verified");
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

  it("requires both parent and organ to remain public during office reads", async () => {
    const query = chain({});
    query.limit.mockResolvedValue({ data: [office], error: null });
    mockFrom.mockReturnValue(query);
    await readPublicBodyOffices(publicParent, publicBody);
    expect(query.eq).toHaveBeenCalledWith("world_organizations.public_visibility", "public");
    expect(query.eq).toHaveBeenCalledWith("world_organization_organs.organization_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("world_organization_organs.visibility", "public");
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
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(WORLD_BODY_OFFICE_LIMIT);
    expect(query.select).toHaveBeenCalledWith("id,organization_id,organ_id,title,office_type,active,world_organizations!inner(id),world_organization_organs!inner(id)");
  });

  it("cancels bounded public office requests when their page unmounts", async () => {
    const controller = new AbortController();
    const query = chain({});
    query.limit.mockResolvedValue({ data: [office], error: null });
    mockFrom.mockReturnValue(query);
    const rows = await readPublicBodyOffices(publicParent, publicBody, controller.signal);
    expect(rows).toHaveLength(1);
    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
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
