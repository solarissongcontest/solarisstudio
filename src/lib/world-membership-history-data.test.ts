import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));

import {
  fetchWorldMembershipCountry,
  fetchWorldMembershipHistory,
} from "./world-membership-history-data";

const exampleProjection = {
  organization: {
    id: "organization-1",
    slug: "guard",
    shortName: "GUARD",
    officialName: "Global Union for Allied Resilience and Defence",
  },
  memberships: [],
  representatives: [],
  offices: [],
};

describe("TG2 public membership history data boundary", () => {
  beforeEach(() => {
    mock.from.mockReset();
    mock.rpc.mockReset();
  });

  it("rejects invalid routes before a Supabase request", async () => {
    expect(await fetchWorldMembershipCountry("OL),status.eq.member")).toBeNull();
    expect(await fetchWorldMembershipHistory("../guard", "11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(await fetchWorldMembershipHistory("guard", "")).toBeNull();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("only reads public country display identity for the requested code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "11111111-1111-1111-1111-111111111111", name: "Oland", short_code: "OL", flag_image: null },
      error: null,
    });
    const ilike = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ ilike });
    mock.from.mockReturnValue({ select });
    expect(await fetchWorldMembershipCountry("ol")).toEqual({
      id: "11111111-1111-1111-1111-111111111111", name: "Oland", code: "OL", flagImage: null,
    });
    expect(mock.from).toHaveBeenCalledWith("countries");
    expect(select).toHaveBeenCalledWith("id,name,short_code,flag_image");
    expect(ilike).toHaveBeenCalledWith("short_code", "OL");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("uses only the public SECURITY DEFINER projection for institutional data", async () => {
    mock.rpc.mockResolvedValue({ data: exampleProjection, error: null });
    const result = await fetchWorldMembershipHistory("guard", "11111111-1111-1111-1111-111111111111");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("world_public_country_membership_history_v1", {
      p_slug: "guard",
      p_country_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(mock.from).not.toHaveBeenCalled();
    expect(result?.organizationName).toBe("GUARD");
    expect(result?.membership).toEqual([]);
  });

  it("does not accept a mismatched country identity returned by the server", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "22222222-2222-2222-2222-222222222222", name: "Other", short_code: "XX", flag_image: null },
      error: null,
    });
    mock.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    await expect(fetchWorldMembershipCountry("OL")).rejects.toThrow(
      "Public country identity did not match",
    );
  });

  it("rejects malformed country identity scopes before institutional reads", async () => {
    expect(await fetchWorldMembershipHistory("guard", "country),id.eq.foreign")).toBeNull();
    expect(await fetchWorldMembershipHistory("guard", "country-1")).toBeNull();
    expect(await fetchWorldMembershipHistory("guard", "x".repeat(100))).toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("uses the exact country parameter rather than downloading another country's rows", async () => {
    mock.rpc.mockResolvedValue({ data: exampleProjection, error: null });
    const countryId = "99999999-9999-9999-9999-999999999999";
    const result = await fetchWorldMembershipHistory("guard", countryId);
    expect(result?.membership).toEqual([]);
    expect(mock.rpc).toHaveBeenCalledWith("world_public_country_membership_history_v1", {
      p_slug: "guard", p_country_id: countryId,
    });
  });

  it("does not convert an unavailable projection into an invented membership", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchWorldMembershipHistory("guard", "11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("propagates transport failures so the UI can show a retry state", async () => {
    const failure = new Error("TG2 public source unavailable");
    mock.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(fetchWorldMembershipHistory("guard", "11111111-1111-1111-1111-111111111111")).rejects.toThrow(
      "TG2 public source unavailable",
    );
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: failure });
    mock.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    await expect(fetchWorldMembershipCountry("OL")).rejects.toThrow(
      "TG2 public source unavailable",
    );
  });
});
