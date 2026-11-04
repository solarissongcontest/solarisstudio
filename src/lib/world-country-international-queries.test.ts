import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => { throw new Error("Unmocked Supabase read"); }),
    rpc: vi.fn(() => Promise.reject(new Error("Unmocked Supabase RPC"))),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  WORLD_PUBLIC_ROLLOUT_QUERY_KEY,
  fetchWorldCountryDirectory,
  fetchWorldCountryIdentity,
  fetchWorldCountryMembershipPage,
  fetchWorldCountryRollout,
  fetchWorldPublicCountryInstitutions,
} from "./world-country-international-queries";

const client = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

const country = {
  id: "country-1", name: "Oland", short_code: "OL",
  region: "Hydra", flag_image: null, accent_color: "#123456",
};
const membership = {
  id: "member-1", country_id: "country-1", organization_id: "org-1",
  membership_type: "member", status: "member",
  joined_at: "2025-03-04T00:00:00Z", ended_at: null,
};
const institution = {
  id: "org-1", slug: "guard", short_name: "GUARD",
  official_name: "Global Union for Allied Resilience and Defence",
  status: "active", public_visibility: "public",
};

/** Inert PostgREST-like chain. All calls are observable and no network exists. */
function mockSelectResponse(response: { data: unknown; count?: number | null; error?: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "or", "order", "is", "not", "in", "ilike"]) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    });
  }
  chain.range = vi.fn(async (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return response;
  });
  chain.maybeSingle = vi.fn(async () => {
    calls.push({ method: "maybeSingle", args: [] });
    return response;
  });
  // The organization reader awaits an `.in()` chain without a final `.range()`.
  chain.then = (resolve: (value: typeof response) => void, reject?: (error: unknown) => void) =>
    Promise.resolve(response).then(resolve, reject);
  client.from.mockReturnValue(chain);
  return { chain, calls };
}

function called(calls: Array<{ method: string; args: unknown[] }>, method: string, ...args: unknown[]) {
  expect(calls).toContainEqual({ method, args });
}

beforeEach(() => {
  client.from.mockReset();
  client.rpc.mockReset();
});

describe("Country International public Supabase read contracts", () => {
  it("shares the canonical World rollout flag key and refuses unknown decisions", async () => {
    expect(WORLD_PUBLIC_ROLLOUT_QUERY_KEY).toEqual(["world", "public", "rollout"]);
    client.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(fetchWorldCountryRollout()).resolves.toBe(false);
    expect(client.rpc).toHaveBeenCalledWith("studio2_feature_enabled", {
      p_key: "terra_world_public", p_edition_id: null,
    });
    client.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchWorldCountryRollout()).rejects.toThrow("publication flag");
    client.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(fetchWorldCountryRollout()).resolves.toBe(true);
    client.rpc.mockResolvedValueOnce({ data: false, error: new Error("offline") });
    await expect(fetchWorldCountryRollout()).rejects.toThrow("could not be verified");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("only selects public country identity fields, sanitizes filters, and orders stably", async () => {
    const { calls } = mockSelectResponse({ data: [country], count: 1, error: null });
    const result = await fetchWorldCountryDirectory(" Oland ),status.eq.private ", 0);
    expect(result.countries).toMatchObject([{ name: "Oland", code: "OL" }]);
    expect(result.count).toBe(1);
    expect(client.from).toHaveBeenCalledWith("countries");
    called(calls, "select", "id,name,short_code,region,flag_image,accent_color", { count: "exact" });
    called(calls, "or", "name.ilike.%Oland statuseqprivate%,short_code.ilike.%Oland statuseqprivate%");
    called(calls, "order", "name", { ascending: true });
    called(calls, "order", "short_code", { ascending: true });
    called(calls, "order", "id", { ascending: true });
    called(calls, "range", 0, 23);
    expect(JSON.stringify(calls)).not.toContain("country_accounts");
  });

  it("bounds directory pages and rejects inconsistent exact-count responses", async () => {
    await expect(fetchWorldCountryDirectory("", -1)).rejects.toThrow("bounded");
    await expect(fetchWorldCountryDirectory("", 1001)).rejects.toThrow("bounded");
    await expect(fetchWorldCountryDirectory("", 0.5)).rejects.toThrow("bounded");
    expect(client.from).not.toHaveBeenCalled();

    const first = mockSelectResponse({ data: [country], count: 49, error: null });
    await fetchWorldCountryDirectory("", 2);
    called(first.calls, "range", 48, 71);
    const emptyButCount = mockSelectResponse({ data: [], count: 4, error: null });
    await expect(fetchWorldCountryDirectory("", 0)).rejects.toThrow("Inconsistent");
    expect(emptyButCount.calls.length).toBeGreaterThan(0);
    mockSelectResponse({ data: [country], count: null, error: null });
    await expect(fetchWorldCountryDirectory("", 0)).rejects.toThrow("count");
  });

  it("requires an exact country identity and never queries malformed codes", async () => {
    await expect(fetchWorldCountryIdentity("../private")).rejects.toThrow("Invalid");
    expect(client.from).not.toHaveBeenCalled();
    const { calls } = mockSelectResponse({ data: country, error: null });
    await expect(fetchWorldCountryIdentity("ol")).resolves.toMatchObject({ code: "OL" });
    called(calls, "ilike", "short_code", "ol");
  });

  it("scopes current memberships by exact country, lifecycle, count and date", async () => {
    const { calls } = mockSelectResponse({ data: [membership], count: 1, error: null });
    await expect(fetchWorldCountryMembershipPage("country-1", "current", 0)).resolves
      .toMatchObject({ rows: [{ status: "member", joinedAt: "2025-03-04T00:00:00Z" }], count: 1 });
    expect(client.from).toHaveBeenCalledWith("world_organization_memberships");
    called(calls, "select", "id,country_id,organization_id,membership_type,status,joined_at,ended_at", { count: "exact" });
    called(calls, "eq", "country_id", "country-1");
    called(calls, "is", "ended_at", null);
    called(calls, "in", "status", ["member", "observer", "associate", "suspended"]);
    called(calls, "order", "joined_at", { ascending: false });
    called(calls, "order", "id", { ascending: true });
    called(calls, "range", 0, 11);
    expect(JSON.stringify(calls)).not.toContain("joined_edition_id");
  });

  it("reads historical memberships only through ended terms and a bounded page", async () => {
    const ended = { ...membership, id: "member-2", status: "withdrawn", ended_at: "2026-01-04T00:00:00Z" };
    const { calls } = mockSelectResponse({ data: [ended], count: 13, error: null });
    const result = await fetchWorldCountryMembershipPage("country-1", "historical", 1);
    expect(result.rows[0].status).toBe("withdrawn");
    called(calls, "eq", "country_id", "country-1");
    called(calls, "not", "ended_at", "is", null);
    called(calls, "in", "status", ["withdrawn", "expelled", "former"]);
    called(calls, "order", "ended_at", { ascending: false });
    called(calls, "order", "id", { ascending: true });
    called(calls, "range", 12, 23);
  });

  it("refuses missing scope, unsupported phase, unbounded page and inconsistent counts before any exposure", async () => {
    await expect(fetchWorldCountryMembershipPage("", "current", 0)).rejects.toThrow("Missing country");
    await expect(fetchWorldCountryMembershipPage("country-1", "current", 1001)).rejects.toThrow("bounded");
    await expect(fetchWorldCountryMembershipPage("country-1", "invalid" as "current", 0)).rejects.toThrow("phase");
    expect(client.from).not.toHaveBeenCalled();
    mockSelectResponse({ data: [membership], count: 0, error: null });
    await expect(fetchWorldCountryMembershipPage("country-1", "current", 0)).rejects.toThrow("Inconsistent");
    mockSelectResponse({ data: [membership], count: 1, error: new Error("offline") });
    await expect(fetchWorldCountryMembershipPage("country-1", "current", 0)).rejects.toThrow("offline");
  });

  it("performs only a bounded second public-organization verification", async () => {
    const { calls } = mockSelectResponse({ data: [institution], error: null });
    const rows = await fetchWorldPublicCountryInstitutions(["org-1"]);
    expect(rows).toMatchObject([{ id: "org-1", name: "GUARD" }]);
    expect(client.from).toHaveBeenCalledWith("world_organizations");
    called(calls, "select", "id,slug,short_name,official_name,status,public_visibility");
    called(calls, "eq", "public_visibility", "public");
    called(calls, "in", "id", ["org-1"]);
    expect(JSON.stringify(calls)).not.toContain("delegation_people");
  });

  it("does not query organizations for empty, duplicate, huge or invalid scopes", async () => {
    await expect(fetchWorldPublicCountryInstitutions([])).resolves.toEqual([]);
    await expect(fetchWorldPublicCountryInstitutions(["org-1", "org-1"])).rejects.toThrow("scope");
    await expect(fetchWorldPublicCountryInstitutions(Array.from({ length: 25 }, (_, i) => "org-" + i))).rejects.toThrow("scope");
    await expect(fetchWorldPublicCountryInstitutions([""])).rejects.toThrow("scope");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects private or cross-scope organization rows even if Supabase returns them", async () => {
    mockSelectResponse({ data: [{ ...institution, public_visibility: "private" }], error: null });
    await expect(fetchWorldPublicCountryInstitutions(["org-1"])).rejects.toThrow("Non-public");
    mockSelectResponse({ data: [institution], error: null });
    await expect(fetchWorldPublicCountryInstitutions(["org-other"])).rejects.toThrow("Out-of-scope");
  });
});
