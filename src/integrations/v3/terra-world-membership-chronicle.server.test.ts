import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/integrations/confirmations/public-runtime.server", () => ({
  createConfirmationPublicRuntimeClient: () => runtime.create(),
}));

import {
  loadWorldMembershipChronicle,
  loadWorldMembershipInstitutions,
} from "./terra-world-membership-chronicle.server";

type QueryResponse = {
  data: unknown;
  count?: number | null;
  error: unknown;
};
type QueryCall = { table: string; method: string; args: unknown[] };
type ResponseQueues = Record<string, QueryResponse[]>;

function installPublicClient(responses: ResponseQueues) {
  const calls: QueryCall[] = [];
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, items]) => [table, [...items]]),
  );

  const client = {
    from(table: string) {
      const response = queues[table]?.shift();
      if (!response) {
        throw new Error("Unexpected public source query: " + table);
      }
      const query: Record<string, (...args: any[]) => any> = {};
      for (const method of [
        "select", "eq", "ilike", "order", "range", "limit",
        "in", "is", "not", "maybeSingle",
      ]) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        };
      }
      query.then = (resolve: (value: QueryResponse) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return query;
    },
  };
  runtime.create.mockReturnValue(client);
  return calls;
}

const organization = {
  id: "org-1",
  slug: "guard",
  short_name: "GUARD",
  public_visibility: "public",
};
const country = {
  id: "country-1",
  name: "Oland",
  short_code: "OLA",
  flag_image: "/flags/ola.png",
};
const membership = {
  id: "membership-1",
  organization_id: "org-1",
  country_id: "country-1",
  membership_type: "member",
  status: "member",
  joined_at: "2026-11-01T00:00:00+00:00",
  ended_at: null,
};
const noError = (data: unknown, count?: number | null): QueryResponse => ({ data, count, error: null });
const filters = { page: 0, organization: "", country: "", scope: "all" as const };

describe("TG3 World membership chronicle server query boundary", () => {
  beforeEach(() => runtime.create.mockReset());

  it("reads only displayed member identities and explicitly public institutions", async () => {
    const calls = installPublicClient({
      world_organization_memberships: [noError([membership], 1)],
      world_organizations: [noError([organization])],
      countries: [noError([country])],
    });

    const result = await loadWorldMembershipChronicle(filters);
    expect(result.total).toBe(1);
    expect(result.records.map((row) => row.organization.shortName)).toEqual(["GUARD"]);
    expect(calls).toContainEqual({
      table: "world_organization_memberships",
      method: "range",
      args: [0, 15],
    });
    expect(calls).toContainEqual({
      table: "world_organizations",
      method: "eq",
      args: ["public_visibility", "public"],
    });
    expect(calls).toContainEqual({
      table: "world_organizations",
      method: "select",
      args: ["id,slug,short_name,public_visibility"],
    });
    expect(calls).toContainEqual({
      table: "countries",
      method: "in",
      args: ["id", ["country-1"]],
    });
    expect(calls.some(({ table, method }) => table === "world_organizations" && method === "range")).toBe(false);
    expect(calls.every(({ method }) => method !== "rpc")).toBe(true);
  });

  it("returns an empty result for unknown or private institution without probing its members", async () => {
    const calls = installPublicClient({
      world_organizations: [noError(null)],
    });
    const result = await loadWorldMembershipChronicle({
      ...filters,
      organization: "unpublished-institution",
    });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
    expect(calls).toContainEqual({
      table: "world_organizations",
      method: "eq",
      args: ["public_visibility", "public"],
    });
    expect(calls.some(({ table }) => table === "world_organization_memberships")).toBe(false);
  });

  it("never treats a private institution as published even if a mocked source returns it", async () => {
    installPublicClient({
      world_organization_memberships: [noError([membership], 1)],
      world_organizations: [noError([{ ...organization, public_visibility: "private" }])],
      countries: [noError([country])],
    });
    await expect(loadWorldMembershipChronicle(filters)).rejects.toThrow(/visibility/);
  });

  it("uses exact country equality, not LIKE wildcard matching", async () => {
    const calls = installPublicClient({
      countries: [noError({ id: "country-1" }), noError([country])],
      world_organization_memberships: [noError([membership], 1)],
      world_organizations: [noError([organization])],
    });
    const result = await loadWorldMembershipChronicle({ ...filters, country: "ola" });
    expect(result.records).toHaveLength(1);
    expect(calls).toContainEqual({
      table: "countries",
      method: "eq",
      args: ["short_code", "OLA"],
    });
    expect(calls.some(({ table, method }) => table === "countries" && method === "ilike")).toBe(false);
  });

  it("enforces current/ended filters at the database, not just in the browser", async () => {
    const calls = installPublicClient({
      world_organization_memberships: [noError([membership], 1)],
      world_organizations: [noError([organization])],
      countries: [noError([country])],
    });
    const result = await loadWorldMembershipChronicle({ ...filters, scope: "current" });
    expect(result.records).toHaveLength(1);
    expect(calls).toContainEqual({
      table: "world_organization_memberships",
      method: "is",
      args: ["ended_at", null],
    });
  });

  it("fails closed on missing exact count instead of reporting an invented total", async () => {
    installPublicClient({
      world_organization_memberships: [noError([membership], null)],
      world_organizations: [noError([organization])],
      countries: [noError([country])],
    });
    await expect(loadWorldMembershipChronicle(filters)).rejects.toThrow(/count/);
  });

  it("fails closed if public institution selection exceeds its verified bound", async () => {
    installPublicClient({
      world_organizations: [noError([organization], 101)],
    });
    await expect(loadWorldMembershipInstitutions()).rejects.toThrow(/Complete public institutional directory/);
  });
});
