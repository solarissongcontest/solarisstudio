import { readFileSync } from "node:fs"; import { describe, expect, it } from "vitest";
const links=readFileSync("src/components/v3/V3ExploreEditorialLink.tsx","utf8");
const world=readFileSync("src/components/world/WorldExploreEntry.tsx","utf8");
describe("Explore route release-safe navigation",()=>{
 it("hides direct destination links not released under maintenance and restricted launch",()=>{
  expect(links).toContain("const { allowsReleased } = usePublicLaunchAvailability()");
  expect(links).toContain("if (!allowsReleased(href)) return null");
 });
 it("World subentries require BOTH World rollout and individual release routes",()=>{
  expect(world).toContain('rollout.data !== true');
  for(const path of ["/world/search","/world/organizations","/world/countries"]) {
    expect(world).toContain(`allowsReleased("${path}")`);
  }
 });
});
