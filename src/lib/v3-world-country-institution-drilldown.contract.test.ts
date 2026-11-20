import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseWorldPublicInstitutions,
  parseWorldCountryAffiliations,
  visibleWorldCountryAffiliations,
} from "./world-country-international";

const source = readFileSync("src/components/world/WorldCountryInternational.tsx", "utf8");

describe("V3 World Country International public institution drill-down", () => {
  const affiliation = {
    id: "membership-1", country_id: "country-1", organization_id: "org-1",
    membership_type: "member", status: "member",
    joined_at: "2026-01-01T00:00:00Z", ended_at: null,
  };
  const publicOrganization = {
    id: "org-1", slug: "guard", short_name: "GUARD",
    official_name: "Global Union for Allied Resilience and Defence",
    public_visibility: "public", status: "active",
  };

  it("only renders dossier links after both public membership and organization checks", () => {
    const rows = parseWorldCountryAffiliations([affiliation], "country-1", "current");
    expect(visibleWorldCountryAffiliations(rows, [])).toEqual([]);
    const institutions = parseWorldPublicInstitutions([publicOrganization], ["org-1"]);
    expect(visibleWorldCountryAffiliations(rows, institutions))
      .toMatchObject([{ organization: { slug: "guard" } }]);
    expect(() => parseWorldPublicInstitutions(
      [{ ...publicOrganization, public_visibility: "private" }], ["org-1"],
    )).toThrow();
    expect(() => parseWorldPublicInstitutions(
      [{ ...publicOrganization, status: "proposed" }], ["org-1"],
    )).toThrow();
    expect(source).toContain("visibleWorldCountryAffiliations(data?.rows ?? [], institutions)");
    expect(source).toContain("safeRows.map(({ affiliation, organization }) =>");
    expect(source).toContain('to="/world/organizations/$slug"');
    expect(source).toContain("params={{ slug: organization.slug }}");
    expect(source).toContain('search={{ tab: "overview" }}');
  });

  it("preserves the editorial Country identity and publication freshness guards", () => {
    expect(source).toContain("WorldCountryRolloutGate");
    expect(source).toContain("<WorldPublicGate verifyOnMount>");
    expect(source).toContain("verifiedWorldQueryData(current)");
    expect(source).toContain("verifiedWorldQueryData(historical)");
    expect(source).toContain("verifiedWorldQueryData(institutions)");
    expect(source).toContain("world-country-editorial-profile");
    expect(source).toContain("world-country-editorial-memberships");
    expect(source).not.toContain("supabaseAdmin");
    expect(source).not.toContain("useAllParticipants");
  });

  it("provides linked, keyboard-sized in-page current and historical sections", () => {
    expect(source).toContain('aria-label="International membership sections"');
    expect(source).toContain('href="#world-country-current"');
    expect(source).toContain('href="#world-country-historical"');
    expect(source).toContain('id={"world-country-" + phase}');
    expect(source).toContain('phase="current"');
    expect(source).toContain('phase="historical"');
    expect(source).toContain('to="/world/organizations"');
    expect(source).toContain("min-h-11");
    expect(source).toContain("Former affiliation does not imply present membership.");
  });
});
