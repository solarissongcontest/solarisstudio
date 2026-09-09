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

  it("never returns null when network analysis times out or fails", () => {
    const code = source("integrations/televoting/intelligence.functions.ts");
    expect(code).toContain("NETWORK_ANALYSIS_TIMEOUT_MS = 8_000");
    expect(code).toContain("Friend-voting network analysis failed");
    expect(code).toContain("return emptyCoordination(");
    expect(code).toContain("analysisDegraded: Boolean(warning)");
  });

  it("keeps Friend Voting as its own Voting section tab", () => {
    const code = source("components/admin/AdminSectionNav.tsx");
    expect(code).toContain('{ label: "Friend voting", to: "/admin/friend-voting"');
    expect(code).not.toContain('label: "Integrity", to: "/televoting/admin/integrity", active: (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting")');
  });
});
