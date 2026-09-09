import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting Worker-safe scope", () => {
  it("uses the latest completed edition instead of the highest edition number", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("resolveLatestCompletedEditionScope");
    expect(code).toContain('.eq("status", "completed")');
    expect(code).toContain("analysing ${label} with all older editions retained as historical baseline evidence");
    expect(code).not.toContain("resolveLatestEditionScope");
  });

  it("runs the broad network on the same completed-edition safe scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("networkScope = isWorkerHeavyDefaultScope(data)");
    expect(code).toContain("await resolveLatestCompletedEditionScope(data)");
    expect(code).not.toContain("Network analysis is disabled for the full-history HOD + jury/televote scope");
  });

  it("surfaces Friend Voting as a primary Voting workspace", () => {
    const overview = source("routes/televoting/admin/index.tsx");
    const workspace = overview.indexOf('eyebrow="Voting workspace"');
    const friendVoting = overview.indexOf('title="Friend-voting intelligence"');
    const advanced = overview.indexOf("Advanced voting tools");
    expect(workspace).toBeGreaterThan(-1);
    expect(friendVoting).toBeGreaterThan(workspace);
    expect(advanced).toBeGreaterThan(friendVoting);
    expect(overview).toContain('to="/admin/friend-voting"');
  });
});
