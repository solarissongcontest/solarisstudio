import { describe, expect, it } from "vitest";
import {
  WORLD_MEMBERS_PAGE_SIZE, WORLD_ORGANIZATIONS_PAGE_SIZE,
  currentWorldMembers, normalizedWorldSearch, parseWorldDirectoryRow,
  parseWorldMemberCountry, parseWorldOrganizationDetail,
} from "./terra-world-public";

const org = {
  id: "org-1", slug: "guard", officialName: "Global Union for Allied Resilience and Defence",
  shortName: "GUARD", type: "international_union",
  status: "active", description: "Official institution", emblemUrl: "javascript:alert(1)",
};

describe("TG2 public institutional read model", () => {
  it("requires explicit publication of each directory row", () => {
    const row = {
      id: "org-1", slug: "guard", official_name: org.officialName,
      short_name: org.shortName, type: org.type, status: "active",
      public_visibility: "public", emblem_url: "/assets/guard.png",
    };
    expect(parseWorldDirectoryRow(row)?.shortName).toBe("GUARD");
    expect(parseWorldDirectoryRow({ ...row, public_visibility: "members" })).toBeNull();
    expect(parseWorldDirectoryRow({ ...row, public_visibility: "private" })).toBeNull();
    expect(parseWorldDirectoryRow({ ...row, status: "unknown" })).toBeNull();
  });

  it("does not expose raw representative, account or holder identifiers", () => {
    const parsed = parseWorldOrganizationDetail({
      organization: { ...org, authUid: "secret-login" },
      organs: [{ id: "a", slug: "gag", name: "General Assembly of GUARD", sortOrder: 10 }],
      memberships: [{ id: "m", countryId: "country-1", status: "member", endedAt: null }],
      offices: [{ id: "o", title: "Chairperson", defaultTermLengthEditions: 2, currentTerm: null }],
      representatives: [{ userId: "secret-login", personId: "secret-person" }],
    });
    expect(parsed?.organization.name).toContain("Defence");
    expect(parsed?.organization.emblemUrl).toBeNull();
    expect(parsed?.offices[0]?.currentHolder).toBeNull();
    expect(parsed?.organs[0]?.name).toContain("GUARD");
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("counts only authoritative current membership, not former members", () => {
    const members = [
      { id: "m1", countryId: "1", status: "member", membershipType: "member", joinedAt: null, endedAt: null },
      { id: "m2", countryId: "2", status: "withdrawn", membershipType: "member", joinedAt: null, endedAt: "2026-01-01" },
      { id: "m3", countryId: "3", status: "suspended", membershipType: "member", joinedAt: null, endedAt: null },
    ];
    expect(currentWorldMembers(members).map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("rejects malformed and partial projections", () => {
    expect(parseWorldOrganizationDetail(null)).toBeNull();
    expect(parseWorldOrganizationDetail({ organization: org, organs: [], memberships: [] })).toBeNull();
    expect(parseWorldOrganizationDetail({
      organization: org, organs: [null], memberships: [], offices: [],
    })).toBeNull();
  });

  it("rejects unsafe image schemes and bounds queries", () => {
    expect(normalizedWorldSearch("GUARD%),status.eq.private")).toBe("GUARDstatuseqprivate");
    expect(parseWorldMemberCountry({
      id: "country-1", name: "Oland", short_code: "OLA", flag_image: "https://example.test/flag.png",
    })?.flagUrl).toBe("https://example.test/flag.png");
    expect(parseWorldMemberCountry({
      id: "country-1", name: "Oland", short_code: "OLA", flag_image: "data:image/svg+xml,secret",
    })?.flagUrl).toBeNull();
    expect(WORLD_MEMBERS_PAGE_SIZE).toBe(20);
    expect(WORLD_ORGANIZATIONS_PAGE_SIZE).toBe(24);
  });
});
