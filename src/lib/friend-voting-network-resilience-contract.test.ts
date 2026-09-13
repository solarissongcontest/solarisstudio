import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend-voting network resilience", () => {
  it("indexes reverse HOD relationships instead of rescanning every observation", () => {
    const code = source("integrations/televoting/coordination-groups-v4.server.ts");
    expect(code).toContain("buildReverseIndex");
    expect(code).toContain("reverseIndex.get");
    expect(code).toContain("submissionRound");
    expect(code).not.toContain("const reverse = observations.filter");
    expect(code).not.toContain("submissions.find((submission)");
  });

  it("never returns null when network analysis fails and refuses the broad HOD scope", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("Friend-voting network analysis failed");
    expect(code).toContain("return emptyCoordination(");
    expect(code).toContain("analysisDegraded: Boolean(warning)");
    expect(code).toContain("Network analysis requires a narrower scope");
    expect(code).toContain("Select an edition or a specific HOD before opening Network");
  });

  it("keeps Friend Voting as its own Voting workflow tab", () => {
    const registry = source("components/admin/admin-contextual-navigation.ts");
    expect(registry).toContain('"Friend voting"');
    expect(registry).toContain('"/admin/friend-voting"');
    expect(registry).not.toContain(
      'path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting")',
    );
  });
});
