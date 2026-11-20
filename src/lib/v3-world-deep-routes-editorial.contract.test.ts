import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const country=readFileSync("src/components/world/WorldCountryInternational.tsx","utf8");
const search=readFileSync("src/components/world/WorldUnifiedSearch.tsx","utf8");
const bodies=readFileSync("src/components/world/WorldBodiesPublic.tsx","utf8");
const organization=readFileSync("src/components/world/WorldPublic.tsx","utf8");
const css=readFileSync("src/styles/v3-world-editorial.css","utf8");
describe("Terra Solaris World deep-route editorial continuity",()=>{
 it("keeps country World identities separate from SSC participants and presents only official affiliations",()=>{
  expect(country).toContain("WorldCountryRolloutGate");
  expect(country).toContain("verifiedWorldQueryData");
  expect(country).toContain("visibleWorldCountryAffiliations");
  expect(country).toContain("world-country-identity-hero");
  expect(country).toContain("world-country-local-nav");
  expect(search).toContain('to="/world/countries/$code"');
  expect(organization).toContain('to="/world/countries/$code"');
 });
 it("keeps public international memberships split into current and former histories",()=>{
  expect(country).toContain('id={"world-country-" + phase}');
  expect(country).toContain('phase="current"');
  expect(country).toContain('phase="historical"');
  expect(country).toContain("WORLD_AFFILIATION_PAGE_SIZE");
  expect(country).toContain("verifiedInstitutions ?? []");
 });
 it("styles real published public bodies rather than constructing missing Court/proposal records",()=>{
  expect(bodies).toContain("readPublicWorldBodies");
  expect(bodies).toContain("readPublicWorldBody");
  expect(bodies).toContain("world-bodies-page-header");
  expect(bodies).toContain("world-bodies-frame");
  expect(css).toContain(".world-country-affiliation-list");
  expect(css).toContain(".world-search-editorial-hero");
  const bodiesCss=readFileSync("src/styles/v3-world-bodies-editorial.css","utf8");
  expect(bodiesCss).toContain(".world-bodies-page-header");
  expect(bodiesCss).toContain("html:not([data-solaris-app]) .world-bodies-editorial");
  expect(bodies).not.toContain("supabaseAdmin");
 });
});
