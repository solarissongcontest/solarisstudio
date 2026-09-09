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

  it("keeps the lightweight payload bound and cannot spin forever in advanced scoring", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(code).toContain("ADVANCED_ANALYSIS_TIMEOUT_MS = 7_000");
    expect(code).toContain("withTimeout(");
    expect(code).toContain("allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
    expect(code).toContain("getMergedIntelligenceServer");
    expect(code).toContain("analysisDegraded: true");
  });

  it("keeps Retry intact and makes all four page tabs visible on narrow mobile screens", () => {
    const code = source("routes/_authenticated/admin/friend-voting.tsx");
    expect(code).toContain("whitespace-nowrap");
    expect(code).toContain("flex flex-col gap-3 sm:flex-row");
    expect(code).toContain("grid grid-cols-2 gap-2 sm:flex");
    expect(code).toContain("Base analysis available");
  });

  it("exposes Friend voting as its own Voting section tab instead of Integrity", () => {
    const code = source("components/admin/AdminSectionNav.tsx");
    expect(code).toContain('{ label: "Friend voting", to: "/admin/friend-voting"');
    expect(code).not.toContain('label: "Integrity", to: "/televoting/admin/integrity", active: (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting")');
    expect(code).toContain("flex flex-wrap gap-1");
  });
});
