import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting prepared V5 scope", () => {
  it("does not downgrade or rewrite broad relationship-analysis scopes", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("const effectiveScope = requested");
    expect(code).toContain("getMergedIntelligenceV5Server");
    expect(code).not.toContain("workerSafeHistoricalScope");
    expect(code).not.toContain("isWorkerHeavyDefaultScope");
    expect(code).not.toContain("isHistoricalAllEditionsScope");
  });

  it("keeps network analysis narrow even though relationship analysis can be broad", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
  });

  it("keeps relationship intelligence discoverable under advanced Voting tools", () => {
    const overview = source("routes/televoting/admin/index.tsx");
    const workspace = overview.indexOf('eyebrow="Voting workspace"');
    const advanced = overview.indexOf("Advanced voting tools");
    const intelligence = overview.indexOf('title="Friend-voting intelligence"');
    expect(workspace).toBeGreaterThan(-1);
    expect(advanced).toBeGreaterThan(workspace);
    expect(intelligence).toBeGreaterThan(advanced);
    expect(overview).toContain('to="/admin/friend-voting"');
  });

  it("keeps selected-edition history causal inside the primary engine", () => {
    const primary = source("integrations/televoting/intelligence.server.ts");
    expect(primary).toContain("selectedEditionNumber");
    expect(primary).toContain("row.editionNumber < selectedEditionNumber");
  });
});
