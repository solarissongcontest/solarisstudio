import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting default scope", () => {
  it("serves the broad request from the all-editions country jury + televote history", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("workerSafeHistoricalScope");
    expect(code).toContain('lens: "country"');
    expect(code).toContain('channel: "combined"');
    expect(code).toContain('mode: "historical" as const');
    expect(code).toContain("worker-safe country-level jury + televote history across all editions");
    expect(code).not.toContain("workerSafeHistoricalTelevoteScope");
    expect(code).not.toContain("const safeScope = await resolveLatestCompletedEditionScope(data)");
    expect(code).not.toContain("all older editions retained as historical baseline evidence");
  });

  it("does not launch v4 for the known Worker-heavy default scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    const heavyScope = code.indexOf("isWorkerHeavyDefaultScope(requested)");
    const historicalBranch = code.indexOf("runHistoricalAnalysis(effectiveScope, settings)", heavyScope);
    const advancedImport = code.indexOf('import("@/integrations/televoting/intelligence-v4.server")', historicalBranch);
    expect(heavyScope).toBeGreaterThan(-1);
    expect(historicalBranch).toBeGreaterThan(heavyScope);
    expect(advancedImport).toBeGreaterThan(historicalBranch);
  });

  it("does not run Network for the broad default scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
  });
});
