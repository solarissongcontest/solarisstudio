import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting resilience", () => {
  it("uses one prepared advanced engine instead of rebuilding the voting universe twice", () => {
    const compatibility = source("integrations/televoting/intelligence-v4.server.ts");
    const v5 = source("integrations/televoting/intelligence-v5.server.ts");

    expect(compatibility).toContain("getMergedIntelligenceV5Server");
    expect(compatibility).not.toContain("loadCanonicalVotingContextServer");
    expect(compatibility).not.toContain("vote_submissions");

    expect(v5).toContain("prepareAdvancedContext");
    expect(v5).toContain("reciprocalIndex");
    expect(v5).toContain("context.advancedAll");
    expect(v5).not.toContain("getMergedIntelligenceServer(");
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

  it("normalizes legacy, Story-voting, jury and modern televote scales before advanced comparison", () => {
    const v5 = source("integrations/televoting/intelligence-v5.server.ts");

    expect(v5).toContain("normalizeScore");
    expect(v5).toContain("score: row.normalized * 100");
    expect(v5).toContain("maxScore: 100");
    expect(v5).toContain("normalizedCrossScaleScores: true");
    expect(v5).toContain("historicalSourcesIncluded: true");
  });

  it("keeps future editions out of an edition-specific historical baseline", () => {
    const v5 = source("integrations/televoting/intelligence-v5.server.ts");

    expect(v5).toContain("number < selectedEditionNumber");
    expect(v5).toContain("id === options.editionId");
    expect(v5).toContain("observation.editionId !== options.editionId");
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
