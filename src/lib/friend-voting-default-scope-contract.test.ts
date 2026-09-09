import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting default scope", () => {
  it("serves the dangerous broad request from the all-editions country televote history", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("workerSafeHistoricalTelevoteScope");
    expect(code).toContain('lens: "country" as const');
    expect(code).toContain('channel: "televote" as const');
    expect(code).toContain("showing country-level televote history across all editions");
    expect(code).not.toContain("const safeScope = await resolveLatestCompletedEditionScope(data)");
    expect(code).not.toContain("all older editions retained as historical baseline evidence");
  });

  it("does not launch v4 for the known Worker-heavy default scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    const heavyBranch = code.indexOf("if (isWorkerHeavyDefaultScope(data))");
    const safeScope = code.indexOf("workerSafeHistoricalTelevoteScope()", heavyBranch);
    const safeBaseCall = code.indexOf("getMergedIntelligenceServer({", safeScope);
    const heavyBranchEnd = code.indexOf("try {", safeBaseCall);
    const v4CallInsideHeavyBranch = code.slice(heavyBranch, heavyBranchEnd).includes("getMergedIntelligenceV4Server");
    expect(heavyBranch).toBeGreaterThan(-1);
    expect(safeScope).toBeGreaterThan(heavyBranch);
    expect(safeBaseCall).toBeGreaterThan(safeScope);
    expect(v4CallInsideHeavyBranch).toBe(false);
  });

  it("does not run Network for the broad default scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
  });
});
