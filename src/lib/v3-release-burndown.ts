import { buildV3ReleaseRiskReport } from "./v3-release-risk";

export const RELEASE_BURNDOWN_CLASSIFICATIONS = [
  "implemented_evidence_missing", "partially_implemented", "not_implemented",
  "obsolete_replaced", "false_positive",
] as const;

type Item = {
  exactFinding: string;
  classification: string;
  implementationPaths: string[];
  testEvidence: string[];
  requiredRepair: string[];
  rationale: string;
  canonicalId?: string;
  domain?: string;
  replacement?: unknown;
};
export type ReleaseBurndown = {
  schemaVersion: number;
  sourceCandidateSha: string;
  kind: string;
  total: number;
  classificationTotals: Record<string, number>;
  publicCutovers: Item[];
  organizerCutovers: Item[];
  consequences: Item[];
};

/** Auditing completeness never accepts a cutover or certifies a release. */
export function auditReleaseBurndown(
  matrix: ReleaseBurndown, currentFindings: readonly string[], exists: (path: string) => boolean,
) {
  const findings: string[] = [];
  const classifications: Record<string, number> = {};
  const entries = [...matrix.publicCutovers, ...matrix.organizerCutovers, ...matrix.consequences];
  const seen = new Set<string>();
  if (matrix.schemaVersion !== 1) findings.push("BURNDOWN_UNSUPPORTED_SCHEMA");
  if (matrix.kind !== "source-classification-not-release-evidence") findings.push("BURNDOWN_INVALID_KIND");
  if (!/^[0-9a-f]{40}$/.test(matrix.sourceCandidateSha)) findings.push("BURNDOWN_INVALID_SOURCE_SHA");
  if (entries.length !== matrix.total) findings.push("BURNDOWN_INCOMPLETE_TOTAL");
  for (const [rows, prefix] of [
    [matrix.publicCutovers, "PUBLIC_CUTOVER_UNRESOLVED "],
    [matrix.organizerCutovers, "ORGANIZER_CUTOVER_UNRESOLVED "],
    [matrix.consequences, "DOMAIN_CONSEQUENCE_DECLARED "],
  ] as const) {
    for (const item of rows) {
      if (!item.exactFinding.startsWith(prefix)) findings.push(`BURNDOWN_WRONG_LANE ${item.exactFinding}`);
      if (seen.has(item.exactFinding)) findings.push(`BURNDOWN_DUPLICATE ${item.exactFinding}`);
      seen.add(item.exactFinding);
      if (!(RELEASE_BURNDOWN_CLASSIFICATIONS as readonly string[]).includes(item.classification)) {
        findings.push(`BURNDOWN_UNKNOWN_CLASSIFICATION ${item.exactFinding}`);
      }
      classifications[item.classification] = (classifications[item.classification] ?? 0) + 1;
      if (!item.rationale?.trim() || !item.requiredRepair?.length) findings.push(`BURNDOWN_UNEXPLAINED ${item.exactFinding}`);
      for (const path of [...item.implementationPaths, ...item.testEvidence]) {
        if (!exists(path)) findings.push(`BURNDOWN_MISSING_REFERENCE ${item.exactFinding} -> ${path}`);
      }
    }
  }
  for (const classification of RELEASE_BURNDOWN_CLASSIFICATIONS) {
    if ((matrix.classificationTotals[classification] ?? 0) !== (classifications[classification] ?? 0)) {
      findings.push(`BURNDOWN_CLASSIFICATION_TOTAL_DRIFT ${classification}`);
    }
  }
  const current = [...new Set(currentFindings)];
  for (const finding of current) {
    if (!seen.has(finding) && !finding.startsWith("STRUCTURAL_INTEGRITY ") && !finding.startsWith("PHYSICAL_OWNER_PENDING ") && !finding.startsWith("PARITY_EVIDENCE_MISSING ")) {
      findings.push(`BURNDOWN_UNCLASSIFIED ${finding}`);
    }
  }
  const releaseRisk = buildV3ReleaseRiskReport(current, entries);
  return {
    schemaVersion: 2,
    auditPassed: findings.length === 0,
    findings,
    classificationTotals: classifications,
    currentReadinessFindingCount: current.length,
    releaseRisk,
    releaseRiskTotals: releaseRisk.totals,
    // Observation only: actual acceptance remains owned by canonical scanners and tests.
    noLongerReported: [...seen].filter((finding) => !currentFindings.includes(finding)).sort(),
  };
}
