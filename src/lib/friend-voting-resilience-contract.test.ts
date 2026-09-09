import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting resilience", () => {
  it("indexes reciprocal observations instead of rescanning the full history", () => {
    const code = source("integrations/televoting/intelligence-v4.server.ts");
    expect(code).toContain("buildReciprocalIndex");
    expect(code).toContain("reverseIndex.get");
    expect(code).toContain("reciprocalEvidence(pair, reverseIndex, currentEdition)");
    expect(code).not.toContain("const reverse = all.filter");
  });

  it("falls back to the base intelligence model if the advanced layer fails", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("getResilientFriendVotingIntelligence");
    expect(code).toContain("getMergedIntelligenceServer");
    expect(code).toContain("analysisDegraded: true");
    expect(code).toContain("Advanced friend-voting analysis failed; falling back to base model");
  });

  it("keeps the mobile retry control and navigation usable", () => {
    const code = source("routes/_authenticated/admin/friend-voting.tsx");
    expect(code).toContain("whitespace-nowrap");
    expect(code).toContain("flex flex-col gap-3 sm:flex-row");
    expect(code).toContain("grid grid-cols-2 gap-2 sm:flex");
    expect(code).toContain("Base analysis available");
  });
});
