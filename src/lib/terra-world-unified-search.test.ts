import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  countries: {
    select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
  },
  organizations: {
    select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import {
  WORLD_UNIFIED_SEARCH_LIMIT,
  fetchWorldUnifiedSearch,
  parseWorldSearchCountries,
  verifiedWorldSearchTerm,
} from "./terra-world-unified-search";

const country = {
  id: "country-oland", name: "Oland", short_code: "OLA",
  region: "Hydra", flag_image: null, accent_color: "#112233",
  account_email: "not-public",
};
const organization = {
  id: "org-guard", slug: "guard", official_name: "Global Union for Allied Resilience and Defence",
  short_name: "GUARD", description: "International institution",
  type: "international_organization", status: "active",
  public_visibility: "public", secret_token: "not-public",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => table === "countries"
    ? mocks.countries : table === "world_organizations" ? mocks.organizations : null);
  mocks.countries.select.mockReturnValue(mocks.countries);
  mocks.countries.or.mockReturnValue(mocks.countries);
  mocks.countries.order.mockReturnValue(mocks.countries);
  mocks.countries.range.mockResolvedValue({ data: [country], count: 1, error: null });
  mocks.organizations.select.mockReturnValue(mocks.organizations);
  mocks.organizations.eq.mockReturnValue(mocks.organizations);
  mocks.organizations.or.mockReturnValue(mocks.organizations);
  mocks.organizations.order.mockReturnValue(mocks.organizations);
  mocks.organizations.range.mockResolvedValue({ data: [organization], count: 1, error: null });
});

describe("Terra Solaris unified public World search", () => {
  it("does not query countries or organizations until two safe characters exist", async () => {
    const blank = await fetchWorldUnifiedSearch("");
    const oneLetter = await fetchWorldUnifiedSearch("a");
    expect(blank.countryTotal).toBe(0);
    expect(oneLetter.organizationTotal).toBe(0);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("removes PostgREST filter syntax from untrusted search strings", async () => {
    expect(verifiedWorldSearchTerm("  GUARD),status.eq.private% "))
      .toBe("GUARDstatuseqprivate");
    await fetchWorldUnifiedSearch("GUARD),status.eq.private%");
    expect(mocks.countries.or).toHaveBeenCalledWith(
      "name.ilike.%GUARDstatuseqprivate%,short_code.ilike.%GUARDstatuseqprivate%");
    expect(mocks.organizations.or).toHaveBeenCalledWith(
      "official_name.ilike.%GUARDstatuseqprivate%,short_name.ilike.%GUARDstatuseqprivate%");
  });

  it("returns only two bounded projections and the verified exact counts", async () => {
    const result = await fetchWorldUnifiedSearch("Ol");
    expect(result.countryTotal).toBe(1);
    expect(result.organizationTotal).toBe(1);
    expect(result.countries[0].name).toBe("Oland");
    expect(result.organizations[0].shortName).toBe("GUARD");
    expect(mocks.from.mock.calls.map((call) => call[0]))
      .toEqual(["countries", "world_organizations"]);
    expect(mocks.countries.select).toHaveBeenCalledWith(
      "id,name,short_code,region,flag_image,accent_color", { count: "exact" });
    expect(mocks.organizations.select).toHaveBeenCalledWith(
      "id,slug,official_name,short_name,type,description,status,public_visibility",
      { count: "exact" });
    expect(mocks.organizations.eq).toHaveBeenCalledWith("public_visibility", "public");
    expect(mocks.countries.range).toHaveBeenCalledWith(0, WORLD_UNIFIED_SEARCH_LIMIT - 1);
    expect(mocks.organizations.range).toHaveBeenCalledWith(0, WORLD_UNIFIED_SEARCH_LIMIT - 1);
    expect(result.countries[0]).not.toHaveProperty("account_email");
    expect(result.organizations[0]).not.toHaveProperty("secret_token");
  });

  it("rejects private or invalid institutional records even if the server returned them", async () => {
    mocks.organizations.range.mockResolvedValueOnce({
      data: [{ ...organization, public_visibility: "private" }], count: 1, error: null,
    });
    await expect(fetchWorldUnifiedSearch("GUARD"))
      .rejects.toThrow("Published organization results could not be verified");
  });

  it("rejects malformed or duplicate canonical country identities", () => {
    expect(() => parseWorldSearchCountries([{ ...country, short_code: "../secret" }])).toThrow();
    expect(() => parseWorldSearchCountries([country, { ...country, id: "other" }]))
      .toThrow("Duplicate World country identity");
  });

  it("fails closed on inconsistent counts instead of inventing zero results", async () => {
    mocks.countries.range.mockResolvedValueOnce({ data: [country], count: null, error: null });
    await expect(fetchWorldUnifiedSearch("Oland"))
      .rejects.toThrow("World search count could not be verified");
    mocks.organizations.range.mockResolvedValueOnce({ data: [], count: 3, error: null });
    await expect(fetchWorldUnifiedSearch("GUARD"))
      .rejects.toThrow("World search count could not be verified");
  });

  it("does not show stale partial results when either data source fails", async () => {
    mocks.organizations.range.mockResolvedValueOnce({
      data: null, count: null, error: { message: "temporarily unavailable" },
    });
    await expect(fetchWorldUnifiedSearch("GUARD"))
      .rejects.toThrow("Public World search is temporarily unavailable");
  });
});
