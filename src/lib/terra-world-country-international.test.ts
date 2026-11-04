import { describe, expect, it } from "vitest";
import {
  WORLD_COUNTRY_MAX_MEMBERSHIPS,
  WORLD_COUNTRY_PAGE_SIZE,
  parseWorldCountryDirectory,
  parseWorldCountryIdentity,
  parseWorldCountryInternational,
  worldCountryCode,
  worldCountrySafeImage,
  worldCountrySearchTerm,
} from "./terra-world-country-international";

const country = {
  id: "country-a", name: "Oland", short_code: "OLA", region: "Hydra",
  flag_image: "/flags/oland.png",
};

const identity = [{
  country_id: "country-a",
  country_name: "Oland",
  short_code: "OLA",
  native_name: "Ålanti",
  controller_person_id: null,
  controller_display_name: null,
  control_started_at: null,
  capital: "Tetlehamn",
  government_type: "Republic",
  leader_name: null,
  leader_title: null,
}];

const memberships = [
  {
    id: "membership-a", organization_id: "org-public", country_id: "country-a",
    membership_type: "member", status: "member",
    joined_at: "2026-01-01T00:00:00Z", ended_at: null,
  },
  {
    id: "membership-b", organization_id: "org-private", country_id: "country-a",
    membership_type: "observer", status: "observer",
    joined_at: "2025-01-01T00:00:00Z", ended_at: null,
  },
  {
    id: "membership-c", organization_id: "org-public", country_id: "country-a",
    membership_type: "observer", status: "former",
    joined_at: "2024-01-01T00:00:00Z", ended_at: "2025-01-01T00:00:00Z",
  },
];

const publicOrganizations = [
  { id: "org-public", slug: "guard", short_name: "GUARD" },
];

describe("Terra Solaris country International public slice", () => {
  it("shows only public institutions and keeps historical terms separate", () => {
    const view = parseWorldCountryInternational(country, identity, memberships, publicOrganizations);
    expect(view.currentMemberships.map((row) => row.organizationName)).toEqual(["GUARD"]);
    expect(view.formerMemberships.map((row) => row.id)).toEqual(["membership-c"]);
    expect(view.currentMemberships[0].organizationSlug).toBe("guard");
    expect(JSON.stringify(view)).not.toContain("org-private");
  });
  it("never fabricates a current controller or political leader", () => {
    const view = parseWorldCountryInternational(country, identity, [], []);
    expect(view.identity.controllerName).toBeNull();
    expect(view.identity.leaderName).toBeNull();
    expect(view.identity.nativeName).toBe("Ålanti");
    expect(view.currentMemberships).toEqual([]);
  });
  it("rejects a cross-country identity and cross-country membership", () => {
    expect(() => parseWorldCountryIdentity(
      [{ ...identity[0], country_id: "foreign" }], "country-a"
    )).toThrow(/mismatch/);
    expect(() => parseWorldCountryInternational(
      country, identity, [{ ...memberships[0], country_id: "foreign" }], publicOrganizations
    )).toThrow(/Foreign/);
  });
  it("rejects duplicate memberships, missing identity and malformed organization slugs", () => {
    expect(() => parseWorldCountryInternational(
      country, identity, [memberships[0], memberships[0]], publicOrganizations
    )).toThrow(/Duplicate/);
    expect(() => parseWorldCountryInternational(country, [], [], [])).toThrow(/Unresolved/);
    expect(() => parseWorldCountryInternational(
      country, identity, [], [{ id: "org-public", slug: "../secret", short_name: "Secret" }]
    )).toThrow(/slug/);
  });
  it("parses bounded directories and rejects uncertain counts", () => {
    expect(WORLD_COUNTRY_PAGE_SIZE).toBe(18);
    expect(WORLD_COUNTRY_MAX_MEMBERSHIPS).toBe(250);
    expect(parseWorldCountryDirectory([country], 1, 0).countries[0].code).toBe("OLA");
    expect(() => parseWorldCountryDirectory([country], null, 0)).toThrow(/count/);
    expect(() => parseWorldCountryDirectory([], -1, 0)).toThrow(/count/);
  });
  it("validates country route identities and rejects unsafe images", () => {
    expect(worldCountryCode(" olA ")).toBe("OLA");
    expect(() => worldCountryCode("../admin")).toThrow();
    expect(worldCountrySafeImage("https://example.org/flag.png")).toContain("https:");
    expect(worldCountrySafeImage("javascript:alert(1)")).toBeNull();
    expect(worldCountrySafeImage("//other.host/flag.svg")).toBeNull();
    expect(worldCountrySafeImage("data:image/svg+xml,<svg>")).toBeNull();
  });
  it("normalizes search without allowing PostgREST filter grammar", () => {
    expect(worldCountrySearchTerm("Ålanti),status.eq.private")).toBe("Ålanti status eq private");
    expect(worldCountrySearchTerm(" _%")).toBe("");
  });
});
