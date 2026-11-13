import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  tokenReads: 0,
  filters: [] as Array<{ table: string; kind: string; value: unknown }>,
}));

vi.mock("@/integrations/supabase/organizer.server", () => ({
  getSolarisAccessTokenServer: () => {
    state.tokenReads += 1;
    return "local-test-token";
  },
  createSolarisAuthenticatedClientServer: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "actor-A" } }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          state.filters.push({ table, kind: "eq:" + field, value });
          return query;
        },
        is: (field: string, value: unknown) => {
          state.filters.push({ table, kind: "is:" + field, value });
          return query;
        },
        or: (value: string) => {
          state.filters.push({ table, kind: "or", value });
          return query;
        },
        in: (field: string, value: unknown) => {
          state.filters.push({ table, kind: "in:" + field, value });
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: state.rows[table] ?? [], error: null }).then(resolve, reject),
      };
      return query;
    },
  }),
}));

import {
  getSolarisCapabilitiesServer,
  requireSolarisCapabilityServer,
} from "@/integrations/supabase/capabilities.server";

const EDITION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EDITION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const active = "2100-01-01T00:00:00Z";
const expired = "2000-01-01T00:00:00Z";

beforeEach(() => {
  state.rows = {};
  state.tokenReads = 0;
  state.filters = [];
});

describe("S16 capability scope resolution on the authenticated server", () => {
  it.each(["", " ", "not-a-uuid", EDITION_A + ",edition_id.not.is.null"])(
    "rejects a malformed or filter-injecting edition scope before auth reads: %s",
    async (scope) => {
      await expect(getSolarisCapabilitiesServer(scope)).rejects.toThrow("Invalid edition scope");
      expect(state.tokenReads).toBe(0);
      expect(state.filters).toEqual([]);
    },
  );

  it("normalizes uppercase UUID scopes without changing authorization meaning", async () => {
    state.rows.studio2_capability_grants = [
      { capability: "edition.read", edition_id: EDITION_A, expires_at: null },
    ];
    const context = await getSolarisCapabilitiesServer(EDITION_A.toUpperCase());
    expect(context.capabilities).toEqual(["edition.read"]);
    expect(state.filters.find((f) => f.table === "studio2_capability_grants" && f.kind === "or")?.value)
      .toContain(EDITION_A);
  });

  it("never promotes expired or another edition's direct grants into authority", async () => {
    state.rows.studio2_capability_grants = [
      { capability: "voting.manage", edition_id: EDITION_B, expires_at: active },
      { capability: "results.publish", edition_id: EDITION_A, expires_at: expired },
      { capability: "integrity.read", edition_id: EDITION_A, expires_at: "invalid-time" },
      { capability: "voting.read", edition_id: EDITION_A, expires_at: active },
      { capability: "edition.read", edition_id: null, expires_at: null },
    ];
    const context = await getSolarisCapabilitiesServer(EDITION_A);
    expect(context.capabilities).toEqual(["voting.read", "edition.read"]);
    await expect(requireSolarisCapabilityServer("voting.manage", EDITION_A)).rejects.toThrow(
      "Solaris capability required: voting.manage",
    );
    expect(state.filters.filter((f) => f.table === "studio2_capability_grants" && f.kind === "eq:user_id"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ value: "actor-A" })]));
  });

  it("does not admit expired or foreign-edition role capabilities", async () => {
    state.rows.studio2_role_assignments = [
      { role_key: "wrong-edition", edition_id: EDITION_B, expires_at: null },
      { role_key: "expired-role", edition_id: EDITION_A, expires_at: expired },
      { role_key: "valid-role", edition_id: EDITION_A, expires_at: active },
    ];
    state.rows.studio2_role_capabilities = [
      { capability: "results.publish" },
    ];
    const context = await getSolarisCapabilitiesServer(EDITION_A);
    expect(state.filters.find((f) => f.table === "studio2_role_capabilities" && f.kind === "in:role_key")?.value)
      .toEqual(["valid-role"]);
    expect(context.capabilities).toEqual(["results.publish"]);
  });

  it("requires global rows for global checks, even when the result is unexpectedly broad", async () => {
    state.rows.studio2_capability_grants = [
      { capability: "voting.manage", edition_id: EDITION_A, expires_at: null },
      { capability: "voting.read", edition_id: null, expires_at: active },
      { capability: "results.verify", edition_id: null, expires_at: expired },
    ];
    state.rows.studio2_role_assignments = [
      { role_key: "edition-role", edition_id: EDITION_A, expires_at: null },
    ];
    const context = await getSolarisCapabilitiesServer(null);
    expect(context.capabilities).toEqual(["voting.read"]);
    expect(state.filters.filter((f) => f.kind === "in:role_key")).toHaveLength(0);
  });
});
