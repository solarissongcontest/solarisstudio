import type { Outcome } from "./v3-release-preflight";
import type { V3ReleaseRiskReport } from "../../src/lib/v3-release-risk";

/** Execution safety is distinct from final release certification. Inventory is
 * retained verbatim; only the independently classified risk controls rehearsal. */
export function assessS14Execution(
  candidateSha: string,
  checks: Record<string, Outcome>,
  requireS16 = true,
) {
  const blockers: string[] = [];
  const inventory = checks.repositoryReleaseReadiness;
  const report = inventory?.report as
    | { candidateSha?: string; findings?: string[]; releaseRisk?: V3ReleaseRiskReport }
    | undefined;
  const risk = report?.releaseRisk;
  if (!/^[0-9a-f]{40}$/.test(candidateSha) || report?.candidateSha !== candidateSha)
    blockers.push("RELEASE_RISK_SHA_MISMATCH_OR_MISSING");
  if (
    !risk?.releaseRiskClassified ||
    !Array.isArray(risk.findings) ||
    !Array.isArray(report?.findings) ||
    risk.unresolvedTotal !== risk.findings.length ||
    new Set(report.findings).size !== risk.findings.length ||
    report.findings.some((finding) => !risk.findings.some((row) => row.finding === finding))
  ) {
    blockers.push("RELEASE_RISK_UNCLASSIFIED_OR_INCOMPLETE");
  } else {
    for (const row of risk.findings) {
      if (row.releaseRisk === "hard_blocker") blockers.push(row.finding);
      else if (
        !["conditional_blocker", "tracked_migration_debt", "obsolete_or_replaced"].includes(
          row.releaseRisk,
        )
      )
        blockers.push(`UNKNOWN_RELEASE_RISK ${row.finding}`);
    }
  }
  // A failed inventory process must have produced valid, classified findings;
  // crashes and unknown findings are never excused as broad readiness debt.
  for (const id of ["repositoryReleaseReadiness", "s15ZeroOrphan"]) {
    const check = checks[id];
    if (!check || check.status === "blocked" || check.exitCode === null)
      blockers.push(`INVENTORY_UNAVAILABLE ${id}`);
    if (
      check?.status !== "pass" &&
      (!check?.findings.length ||
        check.findings.some((finding) => !risk?.findings.some((row) => row.finding === finding)))
    )
      blockers.push(`UNCLASSIFIED_INVENTORY_FAILURE ${id}`);
  }
  for (const id of [
    "productionIsolation",
    "migrationAdoption",
    ...(requireS16 ? ["s16Authority"] : []),
  ]) {
    if (checks[id]?.status !== "pass") blockers.push(`PREREQUISITE_FAILED ${id}`);
  }
  for (const [id, check] of Object.entries(checks)) {
    if (!["repositoryReleaseReadiness", "s15ZeroOrphan"].includes(id) && check.status !== "pass")
      blockers.push(`PREREQUISITE_FAILED ${id}`);
  }
  if (requireS16) {
    const authority = checks.s16Authority?.report as
      | { candidateSha?: string; s16Passed?: boolean; findings?: unknown[] }
      | undefined;
    if (
      authority?.candidateSha !== candidateSha ||
      authority.s16Passed !== true ||
      !Array.isArray(authority.findings) ||
      authority.findings.length
    )
      blockers.push("CANONICAL_AUTHORITY_UNPROVEN");
  }
  return {
    schemaVersion: 1,
    candidateSha,
    allowed: blockers.length === 0,
    releaseReady: false as const,
    blockers: [...new Set(blockers)],
  };
}
