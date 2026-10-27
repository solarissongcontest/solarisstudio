import { describe, expect, it } from "vitest";
import { buildV3ReleaseRiskReport, classifyV3ReleaseFinding } from "./v3-release-risk";

describe("V3 release-risk classification", () => {
  it("preserves the complete finding set while separating release risk", () => {
    const inventory = [
      { exactFinding: "PUBLIC_CUTOVER_UNRESOLVED read-only:building", canonicalId: "read-only", classification: "implemented_evidence_missing" },
      { exactFinding: "ORGANIZER_CUTOVER_UNRESOLVED voting-public-results:building", canonicalId: "voting-public-results", classification: "partially_implemented" },
      { exactFinding: "PUBLIC_CUTOVER_UNRESOLVED dead-route:mapped", canonicalId: "dead-route", classification: "obsolete_replaced" },
    ];
    const current = [
      ...inventory.map((item) => item.exactFinding),
      "DOMAIN_CONSEQUENCE_DECLARED results.calculated owner=results",
      "DOMAIN_CONSEQUENCE_DECLARED analytics.updated owner=public-ux",
    ];
    const report = buildV3ReleaseRiskReport(current, inventory);
    expect(report.unresolvedTotal).toBe(5);
    expect(report.totals).toEqual({
      hard_blocker: 3,
      conditional_blocker: 0,
      tracked_migration_debt: 1,
      obsolete_or_replaced: 1,
    });
    expect(report.releaseRiskClassified).toBe(true);
  });

  it("fails closed for new finding families and unmapped inventory rows", () => {
    expect(classifyV3ReleaseFinding("SOMETHING_NEW bad").releaseRisk).toBe("hard_blocker");
    expect(classifyV3ReleaseFinding("PUBLIC_CUTOVER_UNRESOLVED unseen:building").rule).toBe("fail_closed_unclassified_inventory_finding");
  });

  it("does not demote critical mutation gaps merely because implementation exists", () => {
    const result = classifyV3ReleaseFinding(
      "ORGANIZER_CUTOVER_UNRESOLVED voting-public-results:building",
      { exactFinding: "ORGANIZER_CUTOVER_UNRESOLVED voting-public-results:building", canonicalId: "voting-public-results", classification: "implemented_evidence_missing" },
    );
    expect(result.releaseRisk).toBe("hard_blocker");
  });
});
