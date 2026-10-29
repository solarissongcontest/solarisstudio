import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preflight = readFileSync("scripts/v3-release-preflight.ts", "utf8");

describe("V3 release preflight consequence risk", () => {
  it("classifies unresolved consequences by semantic release role", () => {
    expect(preflight).toContain("classifyV3ConsequenceRelease(row.eventType)");
    expect(preflight).toContain("requiredConsequenceMaturity(releaseClass)");
    expect(preflight).toContain('releaseClass === "integrity_critical" || releaseClass === "delivery_critical"');
    expect(preflight).toContain('"tracked_migration_debt"');
    expect(preflight).toContain('"INTEGRITY_CRITICAL_CONSEQUENCE_PROOF_MISSING"');
    expect(preflight).toContain('"DELIVERY_CRITICAL_CONSEQUENCE_PROOF_MISSING"');
    expect(preflight).toContain('"NON_CRITICAL_CONSEQUENCE_MATURITY_DEBT"');
  });

  it("does not resurrect the old one-size-fits-all transactional consequence label", () => {
    expect(preflight).not.toContain("L_TRANSACTIONAL_EVENT_CONSUMER_PROOF_MISSING");
  });
});
