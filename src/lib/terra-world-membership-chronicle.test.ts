import { describe, expect, it } from "vitest";
import {
  WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE,
  normalizeWorldChronicleCountryCode,
  normalizeWorldChronicleOrganizationSlug,
  parseWorldChronicleInstitutions,
  parseWorldMembershipChronicle,
} from "./terra-world-membership-chronicle";

const organizations = [
  { id: "guard", slug: "guard", short_name: "GUARD" },
  { id: "unity", slug: "unity", short_name: "UNITY" },
];
const country = [{ id: "oland", name: "Oland", short_code: "OLA", flag_image: "/flags/ola.png" }];
const active = {
  id: "m-active", organization_id: "guard", country_id: "oland",
  membership_type: "member", status: "member",
  joined_at: "2026-10-01T00:00:00Z", ended_at: null,
};
const former = {
  id: "m-former", organization_id: "unity", country_id: "oland",
  membership_type: "observer", status: "withdrawn",
  joined_at: "2024-10-01T00:00:00Z", ended_at: "2025-01-01T00:00:00Z",
};
function projection(rows: unknown, scope: "all" | "current" | "ended" = "all") {
  return { rows, organizations, countries: country, count: Array.isArray(rows) ? rows.length : 0, page: 0, scope };
}

describe("Terra Solaris public membership chronicle", () => {
  it("keeps TG2 membership history and current terms distinct", () => {
    const result = parseWorldMembershipChronicle(projection([former, active]));
    expect(result.records.map((item) => item.id)).toEqual(["m-active", "m-former"]);
    expect(result.records[0].endedAt).toBeNull();
    expect(result.records[1].status).toBe("withdrawn");
    expect(result.records[0].country.code).toBe("OLA");
  });
  it("never renders an institution without public visibility proof", () => {
    const result = parseWorldMembershipChronicle({
      ...projection([active]),
      organizations: [{ id: "unity", slug: "unity", short_name: "UNITY" }],
    });
    expect(result.records).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("guard");
  });
  it("rejects mismatched current/ended status, including suspended as an active term", () => {
    expect(parseWorldMembershipChronicle(projection([{ ...active, status: "suspended" }], "current")).records).toHaveLength(1);
    expect(() => parseWorldMembershipChronicle(projection([former], "current"))).toThrow(/scope/);
    expect(() => parseWorldMembershipChronicle(projection([{ ...former, ended_at: null }]))).toThrow(/Inconsistent/);
    expect(() => parseWorldMembershipChronicle(projection([{ ...active, ended_at: "2020-01-01T00:00:00Z" }]))).toThrow(/Inconsistent/);
  });
  it("fails closed when country names, dates or exact counts cannot be verified", () => {
    expect(() => parseWorldMembershipChronicle({ ...projection([active]), countries: [] })).toThrow(/country identity/);
    expect(() => parseWorldMembershipChronicle({ ...projection([active]), count: null })).toThrow(/count/);
    expect(() => parseWorldMembershipChronicle(projection([{ ...active, joined_at: "not-a-date" }]))).toThrow(/start/);
  });
  it("rejects duplicate institutional membership IDs and published organizations", () => {
    expect(() => parseWorldMembershipChronicle(projection([active, active]))).toThrow(/Duplicate/);
    expect(() => parseWorldChronicleInstitutions([...organizations, organizations[0]])).toThrow(/Duplicate/);
  });
  it("does not accept private selectors or PostgREST grammar in filters", () => {
    expect(normalizeWorldChronicleCountryCode("ola")).toBe("OLA");
    expect(normalizeWorldChronicleOrganizationSlug("GUARD")).toBe("guard");
    expect(() => normalizeWorldChronicleOrganizationSlug("guard,visibility.eq.private")).toThrow();
    expect(() => normalizeWorldChronicleCountryCode("../OLA")).toThrow();
    expect(WORLD_MEMBERSHIP_CHRONICLE_PAGE_SIZE).toBe(16);
  });
  it("rejects private organization metadata and invalid image protocols", () => {
    expect(() => parseWorldChronicleInstitutions([{ id: "x", slug: "../hidden", short_name: "Hidden" }])).toThrow();
    const result = parseWorldMembershipChronicle({
      ...projection([active]),
      countries: [{ ...country[0], flag_image: "javascript:alert(1)" }],
    });
    expect(result.records[0].country.flagImage).toBeNull();
  });
});
