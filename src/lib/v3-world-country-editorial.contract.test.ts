import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const view = () => readFileSync(
  resolve(process.cwd(), "src/components/world/WorldCountryInternational.tsx"),
  "utf8",
);
const styles = () => readFileSync(
  resolve(process.cwd(), "src/styles/v3-world-country-editorial.css"),
  "utf8",
);

describe("World Country editorial website design", () => {
  it("uses compact, publication-backed country discovery without app-only styling", () => {
    const source = view();
    const css = styles();
    expect(source).toContain('title="World countries"');
    expect(source).toContain('className="world-country-editorial-directory"');
    expect(source).toContain('className="world-country-editorial-list divide-y');
    expect(source).toContain('className="world-country-editorial-row');
    expect(source).toContain("visibleCountryData.countries.map((country)");
    expect(css).toContain("html:not([data-solaris-app]) .world-country-editorial-directory");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("uses a real flag and country name without duplicating International in the heading", () => {
    const source = view();
    expect(source).toContain('<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{country.name}</h1>');
    expect(source).toContain('FlagChip code={country.code} color={country.accentColor} image={country.flagImage}');
    expect(source).toContain('className="world-country-editorial-identity');
    expect(source).toContain('to="/countries/$code"');
    expect(source).not.toContain("{country.name} · International</h1>");
  });

  it("does not introduce stale or unverified World memberships during the redesign", () => {
    const source = view();
    expect(source).toContain("WorldPublicGate verifyOnMount");
    expect(source).toContain("verifiedWorldQueryData(query)");
    expect(source).toContain("verifiedWorldQueryData(identity)");
    expect(source).toContain("verifiedWorldQueryData(institutions)");
    expect(source).toContain("visibleWorldCountryAffiliations(data?.rows ?? [], institutions)");
    expect(source).toContain("queryFn: () => fetchWorldPublicCountryInstitutions(organizationIds)");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
  });

  it("keeps genuine membership status, dates, pagination, and readable presentation", () => {
    const source = view();
    expect(source).toContain("affiliation.membershipType");
    expect(source).toContain("affiliation.status.replace");
    expect(source).toContain("membershipDate(affiliation.joinedAt)");
    expect(source).toContain("membershipDate(affiliation.endedAt!)");
    expect(source).toContain("WORLD_AFFILIATION_PAGE_SIZE");
    expect(source).toContain("WORLD_COUNTRY_PAGE_SIZE");
    expect(source).toContain("organization.officialName !== organization.name");
    expect(styles()).toContain("forced-colors: active");
  });
});
