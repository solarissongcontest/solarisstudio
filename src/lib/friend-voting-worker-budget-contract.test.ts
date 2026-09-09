import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting Worker budget", () => {
  it("does not race advanced analysis against an uncancellable timeout", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).not.toContain("Promise.race");
    expect(code).not.toContain("ADVANCED_ANALYSIS_TIMEOUT_MS");
    expect(code).toContain("isBroadDefaultScope");
    expect(code).toContain("Full-history HOD + jury/televote scope uses the resource-safe historical model");
  });

  it("keeps the existing lightweight relationship payload bound", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(code).toContain("allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
  });

  it("presents Friend Voting as a primary Voting workspace", () => {
    const overview = source("routes/televoting/admin/index.tsx");
    const primaryStart = overview.indexOf('eyebrow="Voting workspace"');
    const advancedStart = overview.indexOf("Advanced voting tools");
    const friendVoting = overview.indexOf('title="Friend-voting intelligence"');
    expect(primaryStart).toBeGreaterThan(-1);
    expect(friendVoting).toBeGreaterThan(primaryStart);
    expect(advancedStart).toBeGreaterThan(friendVoting);
    expect(overview).toContain('to="/admin/friend-voting"');
  });
});
