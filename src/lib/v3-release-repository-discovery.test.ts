import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITIES, V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-capability-registry";

describe("early repository release blockers", () => {
  it("surfaces declared consequences and cutovers even when structural integrity passes", () => {
    const result = spawnSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/check-v3-release-integrity.ts", "--discovery", "--json"], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);
    const declared = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => row.implementationState === "declared");
    expect(report.structuralPassed).toBe(true);
    expect(report.findings.filter((finding: string) => finding.startsWith("DOMAIN_CONSEQUENCE_DECLARED "))).toHaveLength(declared.length);
    if (declared.length) expect(report.findings).toContain(`DOMAIN_CONSEQUENCE_DECLARED ${declared[0].eventType} owner=${declared[0].ownerDomain}`);
    expect(report.repositoryReady).toBe(report.findings.length === 0);
    expect(result.status).toBe(report.findings.length ? 1 : 0);
    expect(report.findings.some((finding: string) => finding.includes("missing exact-candidate runtime evidence"))).toBe(false);
    expect(Array.isArray(report.pendingCertification)).toBe(true);
  });

  it("keeps accepted read/discovery owners at their exact maturity with concrete evidence", () => {
    const expectedStatuses = {
      "app-shell": "parity",
      "global-search": "parity",
      sitemap: "cutover",
    } as const;

    for (const [id, expectedStatus] of Object.entries(expectedStatuses)) {
      const row = V3_PUBLIC_CAPABILITIES.find((capability) => capability.id === id)!;
      expect(row.specificationStatus).toBe(expectedStatus);
      const evidence = "migrationEvidence" in row ? row.migrationEvidence : "";
      expect(evidence).toBeTruthy();
      for (const path of evidence!.split("; ")) expect(existsSync(path.split(" (")[0])).toBe(true);
    }
  });
});
