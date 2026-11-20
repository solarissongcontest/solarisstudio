import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reader=readFileSync("src/lib/terra-world-public.ts","utf8");
const query=readFileSync("src/lib/terra-world-unified-search.ts","utf8");
const root=readFileSync("src/routes/world/index.tsx","utf8");
const directory=readFileSync("src/routes/world/organizations/index.tsx","utf8");
const profile=readFileSync("src/routes/world/organizations/$slug.tsx","utf8");
const gate=readFileSync("src/components/world/WorldPublic.tsx","utf8");
const entry=readFileSync("src/components/world/WorldExploreEntry.tsx","utf8");
const css=readFileSync("src/styles/v3-world-editorial.css","utf8");
describe("Terra Solaris World search and publication-safe editorial navigation",()=>{
 it("requires a newly verified rollout before mounting public World identities",()=>{
   for(const r of [root,directory,profile])expect(r).toContain("<WorldPublicGate verifyOnMount>");
   expect(reader).toContain('WORLD_PUBLIC_INSTITUTION_STATUSES');
   expect(reader).toContain('isPublicWorldInstitutionStatus');
   expect(gate).toContain('worldPublicQueryVerified(projection)');
   expect(gate).toContain('enabled: verifiedProjection !== null');
   expect(gate).toContain('worldPublicQueryVerified(countries)');
 });
 it("supports bounded independent country and organization search without exposing private results",()=>{
   expect(query).toContain('WORLD_UNIFIED_SEARCH_LIMIT = 12');
   expect(query).toContain('WORLD_PUBLIC_SEARCH_STATUSES');
   expect(query).toContain('eq("public_visibility", "public")');
   expect(query).toContain('WORLD_UNIFIED_SEARCH_MAX_PAGE = 1000');
   expect(query).toContain('worldPublicQueryVerified');
 });
 it("exposes World/countries/organizations/search with editorial hierarchy and readable local navigation",()=>{
   expect(gate).toContain('to="/world/search"');
   expect(gate).toContain('to="/world/countries"');
   expect(gate).toContain('to="/world/organizations/$slug/bodies"');
   expect(entry).toContain('href="/world/search"');
   expect(entry).toContain('href="/world/countries"');
   expect(css).toContain(".world-editorial-hero");
   expect(css).toContain(".world-editorial-quicklinks");
   expect(css).toContain("@media (prefers-reduced-motion:reduce)");
 });
});
