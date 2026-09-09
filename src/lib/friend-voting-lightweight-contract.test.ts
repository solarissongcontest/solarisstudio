import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting lightweight reliability", () => {
  it("keeps the page response bounded while preserving full relationship stats", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    expect(functions).toContain("const LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(functions).toContain("relationships: allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
    expect(functions).toContain("relationships: allRelationships.length");
    expect(functions).toContain("attentionRelationships: allRelationships.filter");
  });

  it("reuses canonical voting context instead of refetching it twice in one intelligence request", () => {
    const context = source("integrations/televoting/canonical-context.server.ts");
    expect(context).toContain("canonicalCache");
    expect(context).toContain("expiresAt: now + 10_000");
    expect(context).toContain("return canonicalCache.promise");
    expect(context).toContain("loadCanonicalVotingContextUncached");
  });
});
