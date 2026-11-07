import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  enabled: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mock.from },
}));
vi.mock("./terra-world-public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./terra-world-public")>();
  return { ...actual, fetchWorldPublicEnabled: mock.enabled };
});

import {
  fetchPublishedFollowingOrganizations,
  MAX_WORLD_FOLLOWING_LOOKUP,
} from "./v3-world-following-public";

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const publicOrg = (id = ID) => ({
  id, slug: "unity", official_name: "UNITY", short_name: "UNITY",
  type: "union", description: null, status: "recognized", public_visibility: "public",
});

function simulateResult(data: unknown, error: unknown = null) {
  const request = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  request.select.mockReturnValue(request);
  request.eq.mockReturnValue(request);
  request.in.mockReturnValue(request);
  mock.from.mockReturnValue(request);
  return request;
}

describe("TG10 Me institution follow public-name boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.enabled.mockResolvedValue(true);
  });

  it("never queries the world directory while rollout is dark", async () => {
    mock.enabled.mockResolvedValue(false);
    expect(await fetchPublishedFollowingOrganizations([ID])).toEqual([]);
    expect(mock.enabled).toHaveBeenCalledTimes(1);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("bounds a single public-only exact-ID lookup and never uses SELECT *", async () => {
    const request = simulateResult([publicOrg(), publicOrg(OTHER)]);
    const result = await fetchPublishedFollowingOrganizations([ID, OTHER, ID]);
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("world_organizations");
    expect(request.select).toHaveBeenCalledWith(
      "id,slug,official_name,short_name,type,description,status,public_visibility",
    );
    expect(request.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(request.in).toHaveBeenCalledWith("id", [ID, OTHER]);
    expect(request.in).toHaveBeenCalledWith("status", ["recognized", "active"]);
    expect(request.limit).toHaveBeenCalledWith(2);
    expect(result.map((item) => item.officialName)).toEqual(["UNITY", "UNITY"]);
  });

  it("does not render unpublished rows even if they are returned unexpectedly", async () => {
    simulateResult([{ ...publicOrg(), public_visibility: "private" }]);
    expect(await fetchPublishedFollowingOrganizations([ID])).toEqual([]);
  });

  it("does not disclose a proposed or unrecognized institution even when a backend mistakenly returns it", async () => {
    const request = simulateResult([
      { ...publicOrg(), status: "proposed", official_name: "Unpublished Council" },
      { ...publicOrg(OTHER), status: "active", official_name: "Published Council" },
    ]);
    expect(await fetchPublishedFollowingOrganizations([ID, OTHER])).toEqual([
      expect.objectContaining({ id: OTHER, officialName: "Published Council" }),
    ]);
    expect(request.in).toHaveBeenCalledWith("status", ["recognized", "active"]);
  });

  it("fails closed on out-of-scope organizations, invalid or excessive IDs", async () => {
    simulateResult([publicOrg(OTHER)]);
    await expect(fetchPublishedFollowingOrganizations([ID])).rejects.toThrow(/scope/);
    mock.from.mockClear();
    await expect(fetchPublishedFollowingOrganizations(["not-a-uuid"])).rejects.toThrow(/safely/);
    await expect(fetchPublishedFollowingOrganizations(
      Array.from({ length: MAX_WORLD_FOLLOWING_LOOKUP + 1 }, (_, i) =>
        `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`),
    )).rejects.toThrow(/safely/);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("does not quietly convert a network failure into an empty public directory", async () => {
    simulateResult(null, { message: "database unreachable" });
    await expect(fetchPublishedFollowingOrganizations([ID])).rejects.toThrow(/unavailable/);
  });

  it("does not perform any I/O when there are no organization follows", async () => {
    expect(await fetchPublishedFollowingOrganizations([])).toEqual([]);
    expect(mock.enabled).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
});
