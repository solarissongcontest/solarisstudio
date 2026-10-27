import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const intelligenceRedirect = readFileSync(
  "src/routes/televoting/admin/intelligence.tsx",
  "utf8",
);
const intelligence = readFileSync(
  "src/routes/_authenticated/admin/friend-voting.tsx",
  "utf8",
);
const intelligenceFunctions = readFileSync(
  "src/integrations/televoting/intelligence.functions.ts",
  "utf8",
);
const analytics = readFileSync("src/routes/televoting/admin/analytics.tsx", "utf8");
const auditLog = readFileSync("src/routes/televoting/admin/audit-log.tsx", "utf8");
const backtest = readFileSync("src/routes/televoting/admin/backtest.tsx", "utf8");
const backtestServer = readFileSync(
  "src/integrations/televoting/backtest.server.ts",
  "utf8",
);
const antiAbuse = readFileSync("src/routes/televoting/admin/anti-abuse.tsx", "utf8");
const combined = readFileSync("src/routes/televoting/admin/combined.tsx", "utf8");

const SPECIALIST_CAPABILITIES = [
  "voting-intelligence",
  "voting-analytics",
  "voting-audit-log",
  "voting-result-backtest",
  "voting-anti-abuse",
] as const;

describe("V3 Organizer read-only voting specialist acceptance evidence", () => {
  it("accepts the observational specialists after executable authority/readback/isolation proof", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    for (const id of SPECIALIST_CAPABILITIES) {
      const capability = byId.get(id);
      expect(capability, `${id} must remain in the Organizer registry`).toBeDefined();
      expect(capability?.migrationStatus).toBe("cutover");
      expect(capability?.migrationEvidence).toContain("v3-organizer-observational-acceptance.test.tsx");
    }
  });

  it("contextualizes Intelligence and Anti-abuse into the implemented evidence workspace", () => {
    expect(intelligenceRedirect).toContain('redirect({ to: "/admin/friend-voting" })');
    expect(antiAbuse).toContain('redirect({ to: "/televoting/admin/intelligence" })');
    expect(intelligence).toContain("Friend-voting intelligence");
    expect(intelligence).toContain("evidence signals, not findings");
    expect(intelligenceFunctions).toContain("getLightweightFriendVotingIntelligence");
    expect(intelligenceFunctions).toContain("getFriendVotingCoordination");
  });

  it("keeps Analytics and Audit Log observational", () => {
    expect(analytics).toContain("getMergedScopedAnalytics");
    expect(analytics).not.toContain("useMutation(");
    expect(auditLog).toContain("listMergedAuditLog");
    expect(auditLog).not.toContain("useMutation(");
  });

  it("keeps historical backtesting an authenticated read-only simulation", () => {
    expect(backtest).toContain("No official result is changed");
    expect(backtest).toContain("read-only simulation");
    expect(backtestServer).toContain("requireMergedTelevotingAdminServer");
    expect(backtestServer).toContain('.from("rounds")');
    expect(backtestServer).not.toContain(".insert(");
    expect(backtestServer).not.toContain(".update(");
    expect(backtestServer).not.toContain(".delete(");
  });

  it("tracks Combined Results as a real mutable building workspace without claiming read-only parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "voting-combined-results",
    );
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
    expect(combined).toContain('title="Combined Results"');
    expect(combined).toContain("listMergedCombinedAggregations");
    expect(combined).toContain("recalculateMergedCombined");
    expect(combined).toContain("AdminConfirmSheet");
    expect(combined).toContain("publishOpen");
    expect(combined).toContain("deleteOpen");
  });
});
