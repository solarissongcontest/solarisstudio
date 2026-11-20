import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("src/components/world/WorldCountryInternational.tsx", "utf8");
const model = readFileSync("src/lib/world-country-international.ts", "utf8");
const queries = readFileSync("src/lib/world-country-international-queries.ts", "utf8");

describe("World country International: verified institution cross-links", () => {
  it("links current and historical affiliation rows to the published institution dossier", () => {
    expect(view).toContain("safeRows.map(({ affiliation, organization }) =>");
    expect(view).toContain('to="/world/organizations/$slug"');
    expect(view).toContain("params={{ slug: organization.slug }}");
    expect(view).toContain('search={{ tab: "overview" }}');
  });

  it("does not turn a private or unrecognized institution into a public link", () => {
    expect(view).toContain("visibleWorldCountryAffiliations(data?.rows ?? [], institutions)");
    expect(model).toContain('data.public_visibility !== "public"');
    expect(model).toContain("RECOGNIZED_INSTITUTION_STATES.has(status)");
    expect(model).toContain("return organization ? [{ affiliation, organization }] : []");
    expect(queries).toContain('.eq("public_visibility", "public")');
  });
});
