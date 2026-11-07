import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

import {
  WORLD_BODY_OFFICE_MAX_PAGE,
  checkedPublicBodyOfficePage,
  readPublicBodyOfficesPage,
  verifyPublicOfficePage,
} from "./terra-world-body-office-pages";
import { WORLD_BODY_OFFICE_LIMIT } from "./terra-world-bodies-public";

const parent = {
  id: "org-1", slug: "guard", shortName: "GUARD", officialName: "GUARD", status: "active",
};
const body = {
  id: "body-1", organizationId: "org-1", slug: "gag", name: "Assembly",
  shortName: "GAG", type: "general_assembly", description: null,
  status: "active" as const, sortOrder: 1,
};
const office = (id: string) => ({
  id, organization_id: "org-1", organ_id: "body-1",
  title: "Assembly Office", office_type: "leadership", active: true,
  holder_user_id: "private", current_term: { holder_user_id: "private" },
  world_organizations: { id: "org-1", public_visibility: "public", status: "active" },
  world_organization_organs: { id: "body-1", organization_id: "org-1", visibility: "public" },
});

function chain(response: { data?: unknown; count?: unknown; error?: unknown }) {
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "in", "order", "abortSignal"]) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  q.range = vi.fn().mockResolvedValue(response);
  // Supabase builders are thenable for HEAD-only count queries.
  q.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return q;
}
beforeEach(() => vi.clearAllMocks());

describe("TG3 body office pagination is bounded, public and complete", () => {
  it("verifies one public page and removes private officeholder data", () => {
    const page = verifyPublicOfficePage([office("one")], 1, 0, "org-1", "body-1");
    expect(page).toEqual({
      offices: [{ id: "one", organizationId: "org-1", organId: "body-1",
        title: "Assembly Office", officeType: "leadership" }],
      total: 1, page: 0,
    });
    expect(page.offices[0]).not.toHaveProperty("holder_user_id");
    expect(page.offices[0]).not.toHaveProperty("current_term");
  });

  it("supports a verified second page instead of hiding offices 21 and beyond", async () => {
    const twenty = Array.from({ length: WORLD_BODY_OFFICE_LIMIT }, (_, i) => office("o-" + i));
    const first = chain({ data: twenty, count: 21, error: null });
    const second = chain({ data: [office("o-20")], count: 21, error: null });
    from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const page0 = await readPublicBodyOfficesPage(parent, body, 0);
    const page1 = await readPublicBodyOfficesPage(parent, body, 1);
    expect(page0.offices).toHaveLength(20);
    expect(page1.offices.map((row) => row.id)).toEqual(["o-20"]);
    expect(page1.total).toBe(21);
    expect(first.range).toHaveBeenCalledWith(0, 19);
    expect(second.range).toHaveBeenCalledWith(20, 39);
    expect(second.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("scopes each page to the same public parent and public organ", async () => {
    const q = chain({ data: [office("one")], count: 1, error: null });
    from.mockReturnValue(q);
    await readPublicBodyOfficesPage(parent, body, 0);
    expect(from).toHaveBeenCalledWith("world_organization_offices");
    expect(q.select).toHaveBeenCalledWith(expect.stringContaining("world_offices_organ_same_organization_fk"), { count: "exact" });
    expect(q.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(q.eq).toHaveBeenCalledWith("organ_id", "body-1");
    expect(q.eq).toHaveBeenCalledWith("active", true);
    expect(q.eq).toHaveBeenCalledWith("world_organizations.public_visibility", "public");
    expect(q.in).toHaveBeenCalledWith("world_organizations.status", ["recognized", "active", "suspended", "historical", "dissolved"]);
    expect(q.eq).toHaveBeenCalledWith("world_organization_organs.visibility", "public");
    expect(q.eq).toHaveBeenCalledWith("world_organization_organs.organization_id", "org-1");
  });

  it("rejects private parent, organ, mismatched organization and a cross-body office", () => {
    const inputs = [
      { ...office("a"), world_organizations: { id: "org-1", public_visibility: "private", status: "active" } },
      { ...office("a"), world_organizations: { id: "org-1", public_visibility: "public", status: "proposed" } },
      { ...office("a"), world_organization_organs: { id: "body-1", organization_id: "org-1", visibility: "private" } },
      { ...office("a"), world_organization_organs: { id: "body-1", organization_id: "other", visibility: "public" } },
      { ...office("a"), organ_id: "body-2" },
    ];
    for (const row of inputs) {
      expect(() => verifyPublicOfficePage([row], 1, 0, "org-1", "body-1")).toThrow("identity");
    }
  });

  it("does not trust incomplete/duplicated records or invalid counts", () => {
    expect(() => verifyPublicOfficePage([office("one")], null, 0, "org-1", "body-1"))
      .toThrow("could not be verified");
    expect(() => verifyPublicOfficePage([office("one")], 21, 0, "org-1", "body-1"))
      .toThrow("count and page disagree");
    expect(() => verifyPublicOfficePage([office("one"), office("one")], 2, 0, "org-1", "body-1"))
      .toThrow("Duplicate");
    expect(() => verifyPublicOfficePage([], 1, 0, "org-1", "body-1"))
      .toThrow("count and page disagree");
  });

  it("prevents bad input, unrecognized parents and invalid pages before any I/O", async () => {
    for (const page of [-1, NaN, 1.5, WORLD_BODY_OFFICE_MAX_PAGE + 1]) {
      expect(() => checkedPublicBodyOfficePage(page)).toThrow("Invalid");
      await expect(readPublicBodyOfficesPage(parent, body, page)).rejects.toThrow("Invalid");
    }
    await expect(readPublicBodyOfficesPage({ ...parent, status: "proposed" }, body, 0))
      .rejects.toThrow("inconsistent");
    await expect(readPublicBodyOfficesPage(parent, { ...body, organizationId: "other" }, 0))
      .rejects.toThrow("inconsistent");
    expect(from).not.toHaveBeenCalled();
  });

  it("propagates abort to the exact requested page", async () => {
    const signal = new AbortController().signal;
    const q = chain({ data: [], count: 0, error: null });
    from.mockReturnValue(q);
    await readPublicBodyOfficesPage(parent, body, 0, signal);
    expect(q.abortSignal).toHaveBeenCalledWith(signal);
  });

  it("recovers a withdrawn out-of-range page through a public-only HEAD recount", async () => {
    const fail = chain({ data: null, count: null, error: { code: "PGRST103" } });
    const recount = chain({ data: null, count: 1, error: null });
    from.mockReturnValueOnce(fail).mockReturnValueOnce(recount);
    const page = await readPublicBodyOfficesPage(parent, body, 1);
    expect(page).toEqual({ offices: [], total: 1, page: 1 });
    expect(recount.select).toHaveBeenCalledWith(expect.any(String), { count: "exact", head: true });
    expect(recount.eq).toHaveBeenCalledWith("world_organizations.public_visibility", "public");
    expect(recount.eq).toHaveBeenCalledWith("world_organization_organs.visibility", "public");
    expect(recount.range).not.toHaveBeenCalled();
  });

  it("fails closed when PostgREST claims 416 but the requested page is in range", async () => {
    from.mockReturnValueOnce(chain({ error: { code: "PGRST103" } }))
      .mockReturnValueOnce(chain({ count: 21, error: null }));
    await expect(readPublicBodyOfficesPage(parent, body, 1)).rejects.toThrow("could not be verified");
  });

  it("rejects other database errors instead of treating them as an empty page", async () => {
    from.mockReturnValue(chain({ error: { code: "PGRST301" } }));
    await expect(readPublicBodyOfficesPage(parent, body, 1)).rejects.toThrow("could not be loaded");
  });
});
