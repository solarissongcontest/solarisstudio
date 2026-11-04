import { describe, expect, it } from "vitest";
import {
  WORLD_DIRECTORY_PAGE_SIZE,
  currentWorldMemberships,
  currentWorldRepresentatives,
  normalizeWorldDirectorySearch,
  parseWorldDirectory,
  parseWorldOrganizationDetail,
  worldImageUrl,
} from "./terra-world-public";

const organization = {
  id: "org-1",
  slug: "guard",
  officialName: "Global Union for Allied Resilience and Defence",
  shortName: "GUARD",
  type: "international_union",
  description: "An organization",
  status: "active",
  revision: 1,
  emblemUrl: "https://example.org/guard.png",
  bannerUrl: "javascript:alert(1)",
};
const projection = {
  organization,
  organs: [{ id: "gag", slug: "gag", name: "General Assembly of GUARD", type: "general_assembly" }],
  memberships: [
    { id: "m1", countryId: "country-1", membershipType: "member", status: "member", joinedAt: "2026-01-01", endedAt: null },
    { id: "m2", countryId: "country-2", membershipType: "member", status: "former", joinedAt: "2025-01-01", endedAt: "2026-01-01" },
  ],
  representatives: [
    { id: "r1", countryId: "country-1", displayName: "Sample person", role: "representative", endsAt: null },
    { id: "r2", countryId: "country-2", displayName: "Past person", role: "representative", endsAt: "2026-01-01" },
  ],
  offices: [
    { id: "chair", slug: "chairperson", title: "Chairperson", successionPolicy: null, currentTerm: null },
  ],
};

describe("Terra Solaris public TG3 models", () => {
  it("never creates leadership, members, or country identities when TG2 provides none", () => {
    const detail = parseWorldOrganizationDetail({ ...projection, memberships: [], representatives: [] });
    expect(detail?.offices[0].currentTerm).toBeNull();
    expect(detail?.countries).toEqual([]);
    expect(detail && currentWorldMemberships(detail)).toEqual([]);
  });
  it("distinguishes active membership and representation from historical rows", () => {
    const detail = parseWorldOrganizationDetail(projection)!;
    expect(currentWorldMemberships(detail).map((x) => x.countryId)).toEqual(["country-1"]);
    expect(currentWorldRepresentatives(detail).map((x) => x.displayName)).toEqual(["Sample person"]);
  });
  it("rejects invalid data instead of silently inventing public organizations", () => {
    expect(parseWorldOrganizationDetail(null)).toBeNull();
    expect(() => parseWorldOrganizationDetail({ ...projection, organization: { ...organization, slug: "../private" } })).toThrow();
    expect(() => parseWorldDirectory([organization], null, 0)).toThrow(/count/);
    expect(() => parseWorldOrganizationDetail({ ...projection, memberships: null })).toThrow();
  });
  it("bounds directory paging and does not accept untrusted image schemes", () => {
    expect(WORLD_DIRECTORY_PAGE_SIZE).toBe(12);
    expect(parseWorldDirectory([organization], 1, 0).organizations[0].bannerUrl).toBeNull();
    expect(worldImageUrl("//evil.example/flag.png")).toBeNull();
    expect(worldImageUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(worldImageUrl("https://example.org/image.png")).toMatch(/^https:/);
  });
  it("cleans PostgREST filter punctuation while retaining real search terms", () => {
    expect(normalizeWorldDirectorySearch("GUARD),status.eq.private")).toBe("GUARD status eq private");
    expect(normalizeWorldDirectorySearch("%_()")).toBe("");
    expect(normalizeWorldDirectorySearch("Ålanti")).toBe("Ålanti");
  });
});
