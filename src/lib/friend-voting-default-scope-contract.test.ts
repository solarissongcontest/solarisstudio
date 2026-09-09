import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting default scope", () => {
  it("resolves the dangerous all-editions combined HOD request to the latest completed edition", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("resolveLatestCompletedEditionScope");
    expect(code).toContain('.from("editions")');
    expect(code).toContain('.eq("status", "completed")');
    expect(code).toContain('.order("edition_number", { ascending: false');
    expect(code).toContain("const safeScope = await resolveLatestCompletedEditionScope(data)");
    expect(code).toContain("all older editions retained as historical baseline evidence");
    expect(code).not.toContain("resolveLatestEditionScope");
  });

  it("does not launch v4 for the known Worker-heavy default scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    const heavyBranch = code.indexOf("if (isWorkerHeavyDefaultScope(data))");
    const v4Call = code.indexOf("getMergedIntelligenceV4Server(data, settings)", heavyBranch);
    const safeBaseCall = code.indexOf("getMergedIntelligenceServer({", heavyBranch);
    expect(heavyBranch).toBeGreaterThan(-1);
    expect(safeBaseCall).toBeGreaterThan(heavyBranch);
    expect(v4Call).toBeGreaterThan(safeBaseCall);
  });
});
