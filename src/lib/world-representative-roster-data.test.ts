import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicWorldRepresentatives } from "./world-representative-roster-data";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

const valid = { slug: "guard", filter: "current" as const, search: "Oland", page: 0 };
const validRow = {
  id: "term-1", countryId: "country-1", countryName: "Oland",
  countryCode: "OLA", countryFlagUrl: null, displayName: "Representative",
  role: "representative", votingAuthority: true,
  startsAt: "2026-11-02T10:00:00+00:00", endsAt: null, revision: 2,
};
const payload = {
  schemaVersion: 1, organizationId: "organization-1", organizationSlug: "guard",
  organizationName: "GUARD", filter: "current", search: "oland",
  offset: 0, limit: 16, total: 1, hasMore: false, rows: [validRow],
};

describe("canonical public TG3 representative read", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("reads only the official page-bounded RPC with exact scope", async () => {
    mocks.rpc.mockResolvedValue({ data: payload, error: null });
    const response = await readPublicWorldRepresentatives(valid);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "world_public_representative_roster_v1",
      { p_slug: "guard", p_status: "current", p_search: "Oland", p_offset: 0, p_limit: 16 },
    );
    expect(response?.rows[0]?.countryName).toBe("Oland");
  });

  it("does not contact the server with invalid slugs or oversized pages", async () => {
    await expect(readPublicWorldRepresentatives({ ...valid, slug: "../admin" })).rejects.toThrow();
    await expect(readPublicWorldRepresentatives({ ...valid, page: 101 })).rejects.toThrow();
    await expect(readPublicWorldRepresentatives({ ...valid, page: 0.5 })).rejects.toThrow();
    await expect(readPublicWorldRepresentatives({ ...valid, filter: "private" as "all" })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats a withheld institution as unavailable rather than empty published membership", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await readPublicWorldRepresentatives(valid)).toBeNull();
  });

  it("fails closed on RPC errors and mismatched institution data", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(readPublicWorldRepresentatives(valid)).rejects.toMatchObject({ message: "permission denied" });
    mocks.rpc.mockResolvedValueOnce({ data: { ...payload, organizationSlug: "unity" }, error: null });
    await expect(readPublicWorldRepresentatives(valid)).rejects.toThrow("INVALID_WORLD_REPRESENTATIVE_PROJECTION");
  });

  it("binds second-page pagination to the actual requested window", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...payload, offset: 16, rows: [], total: 16 }, error: null });
    const result = await readPublicWorldRepresentatives({ ...valid, page: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "world_public_representative_roster_v1",
      { p_slug: "guard", p_status: "current", p_search: "Oland", p_offset: 16, p_limit: 16 },
    );
    expect(result?.rows).toHaveLength(0);
  });
});
