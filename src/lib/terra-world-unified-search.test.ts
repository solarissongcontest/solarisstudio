import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  countries: {
    select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
  },
  organizations: {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import {
  WORLD_UNIFIED_SEARCH_LIMIT,
  WORLD_PUBLIC_SEARCH_STATUSES,
  fetchWorldUnifiedSearch,
  fetchWorldCountrySearchPage,
  fetchWorldOrganizationSearchPage,
  parseWorldSearchCountries,
  parseWorldSearchPage,
  parseWorldSearchCategory,
  verifiedWorldSearchTerm,
  worldPublicQueryVerified,
  verifiedWorldFeaturedOrganizations,
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
  mocks.organizations.in.mockReturnValue(mocks.organizations);
  mocks.organizations.or.mockReturnValue(mocks.organizations);
  mocks.organizations.order.mockReturnValue(mocks.organizations);
  mocks.organizations.range.mockResolvedValue({ data: [organization], count: 1, error: null });
});

describe("Terra Solaris unified public World search", () => {
  it("fails closed when a successful cached query is being rechecked or refetch failed", () => {
    const valid = { isSuccess: true, isError: false, isRefetchError: false, isFetching: false };
    expect(worldPublicQueryVerified(valid)).toBe(true);
    expect(worldPublicQueryVerified({ ...valid, isFetching: true })).toBe(false);
    expect(worldPublicQueryVerified({ ...valid, isRefetchError: true })).toBe(false);
    expect(worldPublicQueryVerified({ ...valid, isError: true })).toBe(false);
    expect(worldPublicQueryVerified({ ...valid, isSuccess: false })).toBe(false);
  });

  it("does not display unrecognized or unrelated organizations as featured unions", () => {
    const rows = [
      { id: "a", slug: "guard", shortName: "GUARD", officialName: "GUARD",
        type: "institution", description: null, status: "active" },
      { id: "b", slug: "unity", shortName: "UNITY", officialName: "UNITY",
        type: "institution", description: null, status: "proposed" },
      { id: "c", slug: "unrelated", shortName: "Other", officialName: "Other",
        type: "institution", description: null, status: "active" },
      { id: "d", slug: "unity", shortName: "UNITY", officialName: "UNITY",
        type: "institution", description: null, status: "recognized" },
    ];
    expect(verifiedWorldFeaturedOrganizations(rows).map((row) => row.id)).toEqual(["a", "d"]);
  });

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
      "name.ilike.%GUARDstatuseqprivate%,short_code.ilike.%GUARDstatuseqprivate%,region.ilike.%GUARDstatuseqprivate%");
    expect(mocks.organizations.or).toHaveBeenCalledWith(
      "official_name.ilike.%GUARDstatuseqprivate%,short_name.ilike.%GUARDstatuseqprivate%");
  });

  it("supports canonical region-name searches without a new country index", async () => {
    await fetchWorldCountrySearchPage("Hydra");
    expect(mocks.countries.or).toHaveBeenCalledWith(
      "name.ilike.%Hydra%,short_code.ilike.%Hydra%,region.ilike.%Hydra%");
    expect(mocks.countries.select).toHaveBeenCalledWith(
      "id,name,short_code,region,flag_image,accent_color", { count: "exact" });
    expect(mocks.organizations.range).not.toHaveBeenCalled();
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
    expect(mocks.organizations.in).toHaveBeenCalledWith("status", [...WORLD_PUBLIC_SEARCH_STATUSES]);
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

  it("rejects an unrecognized proposal even if a backend reader returns it", async () => {
    mocks.organizations.range.mockResolvedValueOnce({
      data: [{ ...organization, status: "proposed" }], count: 1, error: null,
    });
    await expect(fetchWorldUnifiedSearch("unity"))
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

  it("accepts only supported URL search categories", () => {
    expect(parseWorldSearchCategory("countries")).toBe("countries");
    expect(parseWorldSearchCategory("organizations")).toBe("organizations");
    for (const raw of ["all", "private", "countries,all", null, {}, 7]) {
      expect(parseWorldSearchCategory(raw)).toBe("all");
    }
  });

  it("parses shareable page positions without permitting unbounded offsets", () => {
    expect(parseWorldSearchPage(0)).toBe(0);
    expect(parseWorldSearchPage("2")).toBe(2);
    expect(parseWorldSearchPage(1000)).toBe(1000);
    for (const value of [-1, "-1", 1.5, "1.5", "01", "1001", 1001, "NaN", {}, null]) {
      expect(parseWorldSearchPage(value)).toBe(0);
    }
  });

  it("country page changes never request institutions", async () => {
    mocks.countries.range.mockResolvedValueOnce({ data: [country], count: 20, error: null });
    const result = await fetchWorldCountrySearchPage("Oland", 1);
    expect(result.countryTotal).toBe(20);
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["countries"]);
    expect(mocks.countries.range).toHaveBeenCalledWith(12, 23);
    expect(mocks.organizations.range).not.toHaveBeenCalled();
  });

  it("institution page changes never request countries", async () => {
    mocks.organizations.range.mockResolvedValueOnce({ data: [organization], count: 30, error: null });
    const result = await fetchWorldOrganizationSearchPage("GUARD", 1);
    expect(result.organizationTotal).toBe(30);
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["world_organizations"]);
    expect(mocks.organizations.range).toHaveBeenCalledWith(12, 23);
    expect(mocks.countries.range).not.toHaveBeenCalled();
  });

  it("pages countries and organizations independently, with bounded exact ranges", async () => {
    mocks.countries.range.mockResolvedValueOnce({ data: [country], count: 49, error: null });
    mocks.organizations.range.mockResolvedValueOnce({ data: [organization], count: 52, error: null });
    const result = await fetchWorldUnifiedSearch("a", 2, 3);
    // A 1-character query still never searches, including on deep-linked pages.
    expect(result.countries).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
    const paged = await fetchWorldUnifiedSearch("and", 2, 3);
    expect(mocks.countries.range).toHaveBeenCalledWith(24, 35);
    expect(mocks.organizations.range).toHaveBeenCalledWith(36, 47);
    expect(paged.countryTotal).toBe(49);
    expect(paged.organizationTotal).toBe(52);
  });

  it("fails before any query for an invalid reader-supplied page", async () => {
    await expect(fetchWorldUnifiedSearch("Oland", -1, 0))
      .rejects.toThrow("Invalid bounded World search page");
    await expect(fetchWorldUnifiedSearch("GUARD", 0, 1001))
      .rejects.toThrow("Invalid bounded World search page");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a paginated result which contradicts its exact count", async () => {
    mocks.countries.range.mockResolvedValueOnce({ data: [country], count: 12, error: null });
    mocks.organizations.range.mockResolvedValueOnce({ data: [organization], count: 1, error: null });
    await expect(fetchWorldUnifiedSearch("Oland", 1, 0))
      .rejects.toThrow("World search count could not be verified");
  });

  it("accepts an emptied later page so the UI can recover after deletion", async () => {
    mocks.countries.range.mockResolvedValueOnce({ data: [], count: 11, error: null });
    mocks.organizations.range.mockResolvedValueOnce({ data: [organization], count: 1, error: null });
    const result = await fetchWorldUnifiedSearch("and", 2, 0);
    expect(result.countries).toEqual([]);
    expect(result.countryTotal).toBe(11);
  });

  it("never returns an institutional partial result when country verification fails", async () => {
    mocks.countries.range.mockResolvedValueOnce({
      data: null, count: null, error: { message: "country read failed" },
    });
    await expect(fetchWorldUnifiedSearch("GUARD"))
      .rejects.toThrow("Public World country search is temporarily unavailable");
    // An institution may have been fetched, but the aggregate reader never
    // publishes its result without both categories independently verified.
    expect(mocks.organizations.range).toHaveBeenCalledTimes(1);
  });

  it("does not show stale partial results when either data source fails", async () => {
    mocks.organizations.range.mockResolvedValueOnce({
      data: null, count: null, error: { message: "temporarily unavailable" },
    });
    await expect(fetchWorldUnifiedSearch("GUARD"))
      .rejects.toThrow("Public World organization search is temporarily unavailable");
  });
});
