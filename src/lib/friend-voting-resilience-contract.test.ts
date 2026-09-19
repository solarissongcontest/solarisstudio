import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting resilience", () => {
  it("uses one prepared advanced engine instead of rebuilding the voting universe twice", () => {
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

    expect(primary).toContain("const historicalScope = allObservations.filter");
    expect(primary).toContain("const advancedAll = historicalScope.map(advancedObservation)");
    expect(primary).toContain("row.editionNumber < selectedEditionNumber");
    expect(primary).toContain("observationLookup");
    expect(model).toContain("preparedHistoryCache");
    expect(model).toContain("currentEditionNumberCache");
  });

  it("runs the same advanced model for full and payload-bounded endpoints", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    expect(functions).toContain("LIGHTWEIGHT_RELATIONSHIP_LIMIT = 250");
    expect(functions).toContain("allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
    expect(functions).toContain("getMergedIntelligenceV5Server");
    expect(functions).toContain('analysisMode: "advanced"');
    expect(functions).not.toContain("isWorkerHeavyDefaultScope");
    expect(functions).not.toContain("isHistoricalAllEditionsScope");
    expect(functions).not.toContain("workerSafeHistoricalScope");
    expect(functions).not.toContain("Promise.race");
  });

  it("keeps historical mode only as an emergency fallback", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    const model = source("integrations/televoting/advanced-friend-voting.ts");
    expect(functions).toContain("runHistoricalAnalysis");
    expect(functions).toContain("Advanced Friend Voting analysis failed; using historical relationship fallback");
    expect(functions).toContain('analysisMode: "fallback"');
    expect(model).toContain('if (config.mode === "historical")');
    expect(model).toContain("calculateHistoricalPatternRisk");
  });

  it("keeps Retry intact and all four page tabs visible on narrow mobile screens", () => {
    const code = source("routes/_authenticated/admin/friend-voting.tsx");
    expect(code).toContain("whitespace-nowrap");
    expect(code).toContain("flex flex-col gap-3 sm:flex-row");
    expect(code).toContain("grid grid-cols-2 gap-2 sm:flex");
    expect(code).toContain("retry: 0");
  });

  it("keeps Friend voting as its own Voting workflow", () => {
    const registry = source("components/admin/admin-contextual-navigation.ts");
    const sectionNav = source("components/admin/AdminSectionNav.tsx");
    expect(registry).toContain('"Friend voting"');
    expect(registry).toContain('"/admin/friend-voting"');
    expect(sectionNav).toContain("flex flex-wrap");
    expect(sectionNav).not.toContain("overflow-x-auto");
  });
});
