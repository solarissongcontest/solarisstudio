/**
 * Exact-SHA S15 risk gate.
 *
 * A registry migration status is an unresolved cutover inventory item, not
 * automatically an executable second writer or a runtime security defect.
 * The raw S15 evidence remains unchanged and a full release requires ZERO
 * findings; integration PRs independently fail on structural ownership defects.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const CUTOVER_STATUS = /^(?:PUBLIC|ORGANIZER)_CUTOVER_UNRESOLVED [a-z0-9][a-z0-9_.-]*:(?:discovered|mapped|specified|building|parity)$/;

export function summarizeS15Evidence(evidence, candidateSha) {
  if (!SHA.test(candidateSha) || evidence?.candidateSha !== candidateSha) {
    throw new Error("S15 evidence must match the checked-out exact candidate SHA");
  }
  if (typeof evidence.schemaVersion !== "number" || evidence.schemaVersion < 4) {
    throw new Error("S15 evidence lacks versioned physical-ownership proof");
  }
  if (!evidence.inventory || typeof evidence.inventory !== "object" ||
      !evidence.physicalOwnership ||
      typeof evidence.physicalOwnership.zeroOwnershipConflicts !== "boolean" ||
      !Array.isArray(evidence.findings) ||
      evidence.findings.some((finding) => typeof finding !== "string")) {
    throw new Error("S15 evidence is missing a valid physical ownership or findings inventory");
  }
  const physicalClear = evidence.physicalOwnership.zeroOwnershipConflicts;
  const zero = physicalClear && evidence.findings.length === 0;
  if (typeof evidence.zeroOrphans !== "boolean" || evidence.zeroOrphans !== zero) {
    throw new Error("S15 zeroOrphans contradicts its complete raw findings or physical ownership");
  }

  // Only the precise pending registry-status vocabulary may be separated from
  // immediate structural blockers. Unknown findings must FAIL CLOSED.
  const pendingCutovers = evidence.findings.filter((f) => CUTOVER_STATUS.test(f));
  const structuralFindings = evidence.findings.filter((f) => !CUTOVER_STATUS.test(f));
  return {
    candidateSha,
    zeroOrphans: zero,
    physicalOwnershipClear: physicalClear,
    pendingCutovers,
    structuralFindings,
    unresolvedTotal: evidence.findings.length,
  };
}

export function enforceS15Evidence(evidence, candidateSha, { fullRelease = false } = {}) {
  const summary = summarizeS15Evidence(evidence, candidateSha);
  if (!summary.physicalOwnershipClear || summary.structuralFindings.length) {
    throw new Error(
      "S15 structural ownership verification failed: " +
      summary.structuralFindings.length + " non-cutover findings; " +
      "physical ownership clear=" + summary.physicalOwnershipClear,
    );
  }
  if (fullRelease && !summary.zeroOrphans) {
    throw new Error(
      "Full V3 release S15 zero-orphan gate failed: " +
      summary.pendingCutovers.length + " unresolved capability cutovers remain",
    );
  }
  return summary;
}

function main() {
  const path = process.argv[2] || "v3-release-evidence/s15-zero-orphan.json";
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  const expected = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase();
  if (expected && expected !== sha) throw new Error("V3_CANDIDATE_SHA does not match checked-out commit");
  const data = JSON.parse(readFileSync(resolve(path), "utf8"));
  const summary = enforceS15Evidence(data, sha, { fullRelease: process.argv.includes("--full-release") });
  process.stdout.write(
    "S15 exact-SHA " + (process.argv.includes("--full-release") ? "release gate" : "structural gate") +
    ": " + summary.structuralFindings.length + " structural findings, " +
    summary.pendingCutovers.length + " unclassified cutover obligations retained; " +
    "candidate=" + sha + "\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
