import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const publicView=readFileSync("src/components/world/WorldPublic.tsx","utf8");
const reader=readFileSync("src/lib/terra-world-public.ts","utf8");
describe("World organization overview: bounded real Assembly and leadership",()=>{
 it("only advertises a registered active Assembly, never a simulated session",()=>{
  expect(publicView).toContain('organ.type === "assembly" && organ.status === "active"');
  expect(publicView).toContain("world-organization-assembly");
  expect(publicView).toContain('params={{ slug, bodySlug: publishedAssembly.slug }}');
  expect(publicView).toContain("Sessions, votes and agendas remain under their separate publication authorities.");
 });
 it("uses at most three verified current officeholder records and keeps full leadership in its own tab",()=>{
  expect(publicView).toContain('verifiedProjection?.offices ?? []');
  expect(publicView).toContain('.filter((office) => office.currentTerm !== null)');
  expect(publicView).toContain(".slice(0, 3)");
  expect(publicView).toContain('onViewChange("leadership")');
  expect(reader).toContain("currentTerm");
  expect(publicView).not.toContain('supabaseAdmin');
 });
});
