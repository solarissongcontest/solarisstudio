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
    expect(await fetchWorldMembershipHistory("../guard", "country-1")).toBeNull();
    expect(await fetchWorldMembershipHistory("guard", "")).toBeNull();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("only reads public country display identity for the requested code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "country-1", name: "Oland", short_code: "OL", flag_image: null },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mock.from.mockReturnValue({ select });
    expect(await fetchWorldMembershipCountry("ol")).toEqual({
      id: "country-1", name: "Oland", code: "OL", flagImage: null,
    });
    expect(mock.from).toHaveBeenCalledWith("countries");
    expect(select).toHaveBeenCalledWith("id,name,short_code,flag_image");
    expect(eq).toHaveBeenCalledWith("short_code", "OL");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("uses only the public SECURITY DEFINER projection for institutional data", async () => {
    mock.rpc.mockResolvedValue({ data: exampleProjection, error: null });
    const result = await fetchWorldMembershipHistory("guard", "country-1");
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("world_organization_projection_v1", {
      p_slug: "guard",
    });
    expect(mock.from).not.toHaveBeenCalled();
    expect(result?.organizationName).toBe("GUARD");
    expect(result?.membership).toEqual([]);
  });

  it("does not convert an unavailable projection into an invented membership", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchWorldMembershipHistory("guard", "country-1")).toBeNull();
  });

  it("propagates transport failures so the UI can show a retry state", async () => {
    const failure = new Error("TG2 public source unavailable");
    mock.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(fetchWorldMembershipHistory("guard", "country-1")).rejects.toThrow(
      "TG2 public source unavailable",
    );
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: failure });
    mock.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    await expect(fetchWorldMembershipCountry("OL")).rejects.toThrow(
      "TG2 public source unavailable",
    );
  });
});
