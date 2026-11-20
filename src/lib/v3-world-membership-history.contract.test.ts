import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const view=readFileSync("src/components/world/WorldPublic.tsx","utf8");
const route=readFileSync("src/routes/world/organizations/$slug.tsx","utf8");
describe("World history: published completed institution membership terms",()=>{
 it("derives historical membership only from publication-verified canonical projections",()=>{
  expect(view).toContain('verifiedProjection.memberships.filter((row) => row.endedAt !== null)');
  expect(view).toContain('worldPublicQueryVerified(projection)');
  expect(view).toContain('worldPublicQueryVerified(countries)');
  expect(view).toContain('enabled: verifiedProjection !== null && (view === "members" || view === "history")');
  expect(view).toContain("slice(historyPage * WORLD_MEMBER_PAGE_SIZE");
  expect(view).toContain('to="/world/countries/$code"');
 });
 it("allows a stable direct link to the separate read-only history section",()=>{
  expect(route).toContain('"history"');
  expect(view).toContain('view === "history"');
  expect(view).toContain("Former member countries");
  // JSX line wraps are formatting, not different user-visible copy.
  expect(view.replace(/\s+/g, " ")).toContain("does not establish any current rights");
 });
});
