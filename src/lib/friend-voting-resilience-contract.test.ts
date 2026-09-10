import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting resilience", () => {
  it("uses one primary advanced engine instead of rebuilding the voting universe twice", () => {
    const compatibility = source("integrations/televoting/intelligence-v4.server.ts");
    const v5 = source("integrations/televoting/intelligence-v5.server.ts");
    const primary = source("integrations/televoting/intelligence.server.ts");
    const model = source("integrations/televoting/advanced-friend-voting.ts");

    expect(compatibility).toContain("getMergedIntelligenceV5Server");
    expect(compatibility).not.toContain("loadCanonicalVotingContextServer");
    expect(compatibility).not.toContain("vote_submissions");

    expect(v5).toContain("getMergedIntelligenceServer");
    expect(v5).toContain('mode: "advanced"');
    expect(v5).not.toContain("loadCanonicalVotingContextServer");
    expect(v5).not.toContain("vote_submissions");

    expect(primary).toContain("const advancedAll = allObservations.map(advancedObservation)");
    expect(primary).toContain("const observationLookup = new Map<string, Observation[]>()");
    expect(model).toContain("preparedHistoryCache");
    expect(model).toContain("currentEditionNumberCache");
  });

  it("runs the advanced model for the normal and payload-bounded Organizer endpoints", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");

    expect(functions).toContain("LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(functions).toContain("allRelationships.slice(");
    expect(functions).toContain("getMergedIntelligenceV5Server");
    expect(functions).toContain("allowAdvanced: true");
    expect(functions).toContain('analysisMode: "advanced"');
    expect(functions).not.toContain("isWorkerHeavyDefaultScope");
    expect(functions).not.toContain("isHistoricalAllEditionsScope");
    expect(functions).not.toContain("Promise.race");
  });

  it("keeps historical analysis only as an explicit emergency fallback", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    const model = source("integrations/televoting/advanced-friend-voting.ts");

    expect(functions).toContain("runHistoricalAnalysis");
    expect(functions).toContain("Advanced Friend Voting analysis failed; using historical relationship fallback");
    expect(functions).toContain('analysisMode: "fallback"');
    expect(model).toContain('if (config.mode === "historical")');
    expect(model).toContain("calculateHistoricalPatternRisk");
  });

  it("normalizes heterogeneous voting scales inside the advanced model", () => {
    const primary = source("integrations/televoting/intelligence.server.ts");
    const model = source("integrations/televoting/advanced-friend-voting.ts");
    const v5 = source("integrations/televoting/intelligence-v5.server.ts");

    expect(primary).toContain("maxScore > 0 ? score / maxScore : 0");
    expect(model).toContain("row.score / row.maxScore");
    expect(v5).toContain("normalizedCrossScaleScores: true");
    expect(v5).toContain("historicalSourcesIncluded: true");
  });

  it("keeps Retry manual and all four page tabs visible on narrow mobile screens", () => {
    const code = source("routes/_authenticated/admin/friend-voting.tsx");
    expect(code).toContain("whitespace-nowrap");
    expect(code).toContain("flex flex-col gap-3 sm:flex-row");
    expect(code).toContain("grid grid-cols-2 gap-2 sm:flex");
    expect(code).toContain("retry: 0");
  });

  it("exposes Friend voting as its own Voting section tab instead of Integrity", () => {
    const code = source("components/admin/AdminSectionNav.tsx");
    expect(code).toContain('{ label: "Friend voting", to: "/admin/friend-voting"');
    expect(code).not.toContain('label: "Integrity", to: "/televoting/admin/integrity", active: (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting")');
    expect(code).toContain("flex flex-wrap gap-1");
  });
});
