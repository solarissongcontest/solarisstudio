import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditReleaseBurndown, type ReleaseBurndown } from "./v3-release-burndown";

const snapshot = () => JSON.parse(readFileSync("docs/v3-release-burndown.json", "utf8")) as ReleaseBurndown;
const entries = (matrix: ReleaseBurndown) => [...matrix.publicCutovers, ...matrix.organizerCutovers, ...matrix.consequences];

describe("complete release burn-down classification", () => {
  it("accounts for all original findings and adds deterministic release risk without deleting inventory", () => {
    const matrix = snapshot();
    expect(matrix.publicCutovers).toHaveLength(43);
    expect(matrix.organizerCutovers).toHaveLength(81);
    expect(matrix.consequences).toHaveLength(40);
    const current = entries(matrix).map((row) => row.exactFinding);
    const report = auditReleaseBurndown(matrix, current, existsSync);
    expect(report.findings).toEqual([]);
    expect(report.auditPassed).toBe(true);
    expect(report.currentReadinessFindingCount).toBe(164);
    expect(report.noLongerReported).toEqual([]);
    expect(Object.values(report.releaseRiskTotals).reduce((sum, value) => sum + value, 0)).toBe(164);
    expect(report.releaseRisk.releaseRiskClassified).toBe(true);
  });

  it("rejects duplicate, unexplained, misclassified and missing-source items", () => {
    const matrix = snapshot();
    matrix.schemaVersion = 99;
    const original = matrix.publicCutovers[0];
    matrix.publicCutovers[1] = { ...original, rationale: "", requiredRepair: [],
      classification: "done", implementationPaths: ["src/no-such-proof.ts"] };
    const report = auditReleaseBurndown(matrix, [original.exactFinding], existsSync);
    expect(report.auditPassed).toBe(false);
    for (const code of ["BURNDOWN_UNSUPPORTED_SCHEMA", "BURNDOWN_DUPLICATE", "BURNDOWN_UNEXPLAINED", "BURNDOWN_UNKNOWN_CLASSIFICATION", "BURNDOWN_MISSING_REFERENCE", "BURNDOWN_CLASSIFICATION_TOTAL_DRIFT"]) {
      expect(report.findings.some((finding) => finding.startsWith(code))).toBe(true);
    }
  });

  it("requires newly discovered migration findings to be inventoried and treats disappearance only as an observation", () => {
    const matrix = snapshot();
    const old = entries(matrix).map((row) => row.exactFinding);
    const current = old.filter((finding) => !finding.includes("receipt.reconciled"));
    const report = auditReleaseBurndown(matrix, current, existsSync);
    expect(report.auditPassed).toBe(true);
    expect(report.currentReadinessFindingCount).toBe(163);
    expect(report.noLongerReported).toEqual(old.filter((finding) => finding.includes("receipt.reconciled")));
    const added = auditReleaseBurndown(matrix, [...current, "PUBLIC_CUTOVER_UNRESOLVED new-owner:building"], existsSync);
    expect(added.findings).toContain("BURNDOWN_UNCLASSIFIED PUBLIC_CUTOVER_UNRESOLVED new-owner:building");
    expect(added.releaseRisk.findings.find((item) => item.finding.includes("new-owner"))?.releaseRisk).toBe("hard_blocker");
  });
});
