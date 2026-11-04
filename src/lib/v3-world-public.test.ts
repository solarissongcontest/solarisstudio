import { describe, expect, it } from "vitest";
import { currentWorldMembers, normalizeWorldSearch, pageWorldMembers, parseWorldDirectory, parseWorldOrganization } from "./v3-world-public";

const org = { id: "org-1", slug: "guard", officialName: "Global Union for Allied Resilience and Defence", shortName: "GUARD", description: null, type: "international_organization", status: "active" };
const membership = (id: string, status: string, endedAt: string | null = null) => ({
  id, countryId: id, membershipType: "member", status, joinedAt: "2026-01-01T00:00:00Z", endedAt,
});
const projection = {
  organization: org,
  organs: [{ id: "organ-1", name: "General Assembly of GUARD", status: "active" }],
  memberships: [membership("a", "member"), membership("b", "suspended"), membership("c", "former", "2026-02-01T00:00:00Z")],
  representatives: [], // not used by TG3 overview until an authorized public representation view is designed
  offices: [{ id: "office-1", title: "Chairperson", currentTerm: null }],
};

describe("TG3 public organizations", () => {
  it("uses public directory projection fields, never an invented local organization list", () => {
    expect(parseWorldDirectory([{ id: "org-1", slug: "guard", official_name: org.officialName, short_name: org.shortName, status: "active", type: "international_organization", description: null }])[0]).toMatchObject({ slug: "guard", shortName: "GUARD" });
  });
  it("rejects malformed and duplicate directory identities", () => {
    const entry = { id: "x", slug: "guard", official_name: "GUARD", short_name: "GUARD", status: "active", type: "institution" };
    expect(() => parseWorldDirectory([entry, entry])).toThrow(/Duplicate/);
    expect(() => parseWorldDirectory([{ ...entry, slug: "../admin" }])).toThrow();
    expect(() => parseWorldDirectory([{ ...entry, status: "unknown" }])).toThrow();
  });
  it("rejects wrong-scope RPC responses and does not fabricate private institutions", () => {
    expect(parseWorldOrganization(null, "guard")).toBeNull();
    expect(() => parseWorldOrganization(projection, "unity")).toThrow(/scope/);
    expect(() => parseWorldOrganization(projection, "../../private")).toThrow();
  });
  it("separates current members from historical and includes suspended members as suspended", () => {
    const detail = parseWorldOrganization(projection, "guard")!;
    expect(currentWorldMembers(detail.memberships).map((row) => row.status)).toEqual(["member", "suspended"]);
    expect(detail.offices[0]?.currentTerm).toBeNull();
  });
  it("bounds member pagination and handles invalid page numbers", () => {
    const items = Array.from({ length: 51 }, (_, n) => membership(String(n), "member")) as ReturnType<typeof parseWorldOrganization> extends infer _T ? any : never;
    expect(pageWorldMembers(items, 0).items).toHaveLength(24);
    expect(pageWorldMembers(items, 2).items).toHaveLength(3);
    expect(pageWorldMembers(items, 200).page).toBe(2);
    expect(pageWorldMembers(items, Number.NaN).page).toBe(0);
  });
  it("removes PostgREST filter operators from search input", () => {
    expect(normalizeWorldSearch("GUARD),status.eq.private")).toBe("GUARD status eq private");
    expect(normalizeWorldSearch("   UNITY   ")).toBe("UNITY");
    expect(normalizeWorldSearch("x".repeat(100))).toHaveLength(80);
  });
});
