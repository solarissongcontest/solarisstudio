import { readFileSync } from "node:fs"; import { describe, expect, it } from "vitest";
const page=readFileSync("src/components/world/WorldPublic.tsx","utf8");
const css=readFileSync("src/styles/v3-world-editorial.css","utf8");
describe("World landing quiet editorial CTA hierarchy",()=>{
 it("uses one primary search action with two distinct discovery sections, not duplicate action blocks",()=>{
   const root=page.split("export function WorldLanding()")[1]?.split("export function WorldDirectory()")[0]??"";
   expect(root).toContain('Search the world');
   expect(root).toContain('world-editorial-quicklinks');
   expect(root).toContain('to="/world/organizations"');
   expect(root).toContain('to="/world/countries"');
   expect(root.split('to="/world/search"').length-1).toBe(1);
   expect(css).toContain("repeat(2,minmax(0,1fr))");
 });
});
