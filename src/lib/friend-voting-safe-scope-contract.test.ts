import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting Worker-safe scope", () => {
  it("serves the broad default from the country-level historical televote path", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("workerSafeHistoricalTelevoteScope");
    expect(code).toContain('lens: "country" as const');
    expect(code).toContain('channel: "televote" as const');
    expect(code).toContain("showing country-level televote history across all editions");
    expect(code).not.toContain("analysing ${label} with all older editions retained as historical baseline evidence");
  });

  it("does not launch network analysis for the dangerous broad HOD scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
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
