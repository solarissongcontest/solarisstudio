import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting default scope", () => {
  it("runs the broad default through the prepared advanced engine", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("getMergedIntelligenceV5Server");
    expect(code).toContain('analysisMode: "advanced"');
    expect(code).toContain("const effectiveScope = requested");
    expect(code).not.toContain("workerSafeHistoricalScope");
  });

  it("uses historical analysis only after advanced analysis fails", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    const advanced = code.indexOf("getMergedIntelligenceV5Server");
    const fallback = code.indexOf("runHistoricalAnalysis(effectiveScope, settings)", advanced);
    expect(advanced).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(advanced);
  });

  it("does not run Network for the broad default HOD scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
  });
});
