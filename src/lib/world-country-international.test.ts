import { describe, expect, it } from "vitest";

import {
  normalizeWorldCountrySearch,
  parseWorldCountryAffiliations,
  parseWorldPublicCountries,
  parseWorldPublicInstitutions,
  validWorldCountryCode,
  verifiedWorldCount,
  visibleWorldCountryAffiliations,
  worldCountrySearchFilter,
} from "./world-country-international";

const country = {
  id: "country-1", name: "Oland", short_code: "OL", region: "Hydra",
  flag_image: null, accent_color: "#123456",
};

const current = {
  id: "m-1", country_id: country.id, organization_id: "org-1", membership_type: "member",
  status: "member", joined_edition_id: null, ended_edition_id: null, ended_at: null,
};

const historical = {
  ...current, id: "m-2", status: "former", ended_at: "2026-01-04T00:00:00Z",
};

const organization = {
  id: "org-1", slug: "guard", short_name: "GUARD",
  official_name: "Global Union for Allied Resilience and Defence",
  public_visibility: "public", status: "active",
};

describe("World country International public read boundaries", () => {
  it("accepts canonical country identities and refuses duplicates and malformed rows", () => {
    expect(parseWorldPublicCountries([country])[0]).toMatchObject({
      code: "OL", name: "Oland", accentColor: "#123456",
    });
    expect(validWorldCountryCode("OL")).toBe(true);
    expect(validWorldCountryCode("../../admin")).toBe(false);
    expect(() => parseWorldPublicCountries([country, country])).toThrow("Duplicate");
    expect(() => parseWorldPublicCountries([{ ...country, name: "" }])).toThrow();
  });

  it("never interpolates caller filter grammar or unbounded input into PostgREST", () => {
    expect(normalizeWorldCountrySearch("  Oland ),status.eq.private  "))
      .toBe("Oland statuseqprivate");
    expect(worldCountrySearchFilter("Oland")).toBe("name.ilike.%Oland%,short_code.ilike.%Oland%");
    expect(worldCountrySearchFilter("),(")).toBeNull();
    expect(normalizeWorldCountrySearch("x".repeat(100))).toHaveLength(64);
  });

  it("enforces exact country scope and current versus historical memberships", () => {
    const live = parseWorldCountryAffiliations([current], country.id, "current");
    expect(live).toHaveLength(1);
    expect(parseWorldCountryAffiliations([historical], country.id, "historical")).toHaveLength(1);
    expect(() => parseWorldCountryAffiliations([current], "foreign-country", "current")).toThrow("Cross-country");
    expect(() => parseWorldCountryAffiliations([historical], country.id, "current")).toThrow("Non-current");
    expect(() => parseWorldCountryAffiliations([current], country.id, "historical")).toThrow("Non-historical");
  });

  it("refuses invalid state, duplicate affiliation and invented country ownership", () => {
    expect(() => parseWorldCountryAffiliations([current, current], country.id, "current")).toThrow("Duplicate");
    expect(() => parseWorldCountryAffiliations([{ ...current, status: "magically_approved" }], country.id, "current")).toThrow();
    expect(() => parseWorldCountryAffiliations([{ ...current, membership_type: "chairperson" }], country.id, "current")).toThrow();
  });

  it("requires a second public-only institution authorization gate", () => {
    const safe = parseWorldPublicInstitutions([organization], ["org-1"]);
    expect(safe).toMatchObject([{ name: "GUARD" }]);
    expect(() => parseWorldPublicInstitutions([{ ...organization, public_visibility: "private" }], ["org-1"])).toThrow();
    expect(() => parseWorldPublicInstitutions([organization], ["org-foreign"])).toThrow();
    expect(() => parseWorldPublicInstitutions([organization, organization], ["org-1"])).toThrow();
  });

  it("hides affiliations whose organization is not confirmed public", () => {
    const live = parseWorldCountryAffiliations([current], country.id, "current");
    expect(visibleWorldCountryAffiliations(live, [])).toEqual([]);
    const safe = parseWorldPublicInstitutions([organization], ["org-1"]);
    expect(visibleWorldCountryAffiliations(live, safe)).toEqual([
      { affiliation: live[0], organization: safe[0] },
    ]);
    expect(JSON.stringify(visibleWorldCountryAffiliations(live, safe))).not.toContain("user_id");
  });

  it("refuses missing count proof instead of treating an unknown page as empty", () => {
    expect(verifiedWorldCount(0)).toBe(0);
    expect(verifiedWorldCount(24)).toBe(24);
    for (const bad of [undefined, null, "3", -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => verifiedWorldCount(bad)).toThrow();
    }
  });
});
