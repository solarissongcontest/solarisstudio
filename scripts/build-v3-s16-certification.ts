import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  V3_S16_CERTIFICATION_CATEGORIES,
  type V3S16CertificationCategoryEvidence,
  type V3S16CertificationEvidence,
} from "../src/lib/v3-s16-certification-contract";
import {
  validateV3S16SurfaceEvidence,
  type V3S16SurfaceCategory,
} from "../src/lib/v3-s16-surface-evidence-contract";

const requireCertified = process.argv.includes("--require-certified");
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SURFACE_CATEGORIES = new Set<V3S16SurfaceCategory>([
  "public-acceptance",
  "organizer-acceptance",
  "navigation-acceptance",
  "accessibility",
  "responsive-behavior",
]);

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function semanticIssues(
  categoryId: string,
  evidence: Record<string, unknown>,
  candidateSha: string,
): string[] {
  const issues: string[] = [];

  if (SURFACE_CATEGORIES.has(categoryId as V3S16SurfaceCategory)) {
    return validateV3S16SurfaceEvidence(
      evidence,
      categoryId as V3S16SurfaceCategory,
      candidateSha,
    );
  }

  if (categoryId === "canonical-ci" || categoryId === "production-isolation") {
    const provenance = record(evidence.provenance);
    if (provenance?.workflow !== "Quality") {
      issues.push(`${categoryId}: provenance must come from canonical Quality workflow`);
    }
    if (provenance?.conclusion !== "success") {
      issues.push(`${categoryId}: canonical Quality workflow conclusion is not success`);
    }
    if (typeof provenance?.runId !== "number" || typeof provenance?.runAttempt !== "number") {
      issues.push(`${categoryId}: canonical Quality run identity is incomplete`);
    }
  }

  if (categoryId === "migration-rehearsal") {
    const provenance = record(evidence.provenance);
    if (provenance?.workflow !== "Rules + Integrity migration rehearsal") {
      issues.push(`${categoryId}: provenance must come from canonical migration rehearsal workflow`);
    }
    if (provenance?.conclusion !== "success") {
      issues.push(`${categoryId}: migration rehearsal workflow conclusion is not success`);
    }
    if (typeof provenance?.runId !== "number" || typeof provenance?.runAttempt !== "number") {
      issues.push(`${categoryId}: migration rehearsal run identity is incomplete`);
    }
  }

  if (categoryId === "authorization-security") {
    const authorization = record(evidence.authorization);
    const security = record(evidence.securityAdvisors);
    if (authorization?.ready !== true) {
      issues.push("authorization-security: canonical authorization registry is not release-ready");
    }
    if (authorization?.declaredCount !== 0 || authorization?.knownGapCount !== 0) {
      issues.push("authorization-security: declared commands or known authorization gaps remain");
    }
    if (!Array.isArray(authorization?.registryErrors) || authorization.registryErrors.length !== 0) {
      issues.push("authorization-security: authorization registry has structural errors");
    }
    if (security?.exactCandidateSha !== true || security?.releaseReady !== true) {
      issues.push("authorization-security: security advisor classification is not exact-SHA release-ready");
    }
  }

  if (categoryId === "full-contest-rehearsal") {
    if (evidence.partial === true) issues.push("full-contest-rehearsal: partial evidence cannot certify S16");
    if (Array.isArray(evidence.pendingStages) && evidence.pendingStages.length !== 0) {
      issues.push("full-contest-rehearsal: pending stages remain");
    }
  }

  if (categoryId === "registry-zero-gap") {
    if (evidence.zeroOrphans !== true) issues.push("registry-zero-gap: zeroOrphans is not true");
    if (Array.isArray(evidence.findings) && evidence.findings.length !== 0) {
      issues.push("registry-zero-gap: orphan findings remain");
    }
  }

  return issues;
}

const checkedOutSha = currentCommitSha();
const requestedCandidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || "";

if (!SHA_PATTERN.test(requestedCandidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
if (requestedCandidateSha !== checkedOutSha) {
  throw new Error(
    `V3_CANDIDATE_SHA ${requestedCandidateSha} does not match checked-out SHA ${checkedOutSha}`,
  );
}

const evidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
mkdirSync(evidenceDir, { recursive: true });

const categories: Array<V3S16CertificationCategoryEvidence & { reason?: string }> = [];

for (const category of V3_S16_CERTIFICATION_CATEGORIES) {
  const path = join(evidenceDir, category.evidenceFilename);
  let evidenceCandidateSha = "";
  let passed = false;
  let reason: string | undefined;

  if (!existsSync(path)) {
    reason = `missing exact-candidate evidence: ${category.evidenceFilename}`;
  } else {
    try {
      const evidence = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      evidenceCandidateSha =
        typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";

      if (!SHA_PATTERN.test(evidenceCandidateSha)) {
        reason = `${category.evidenceFilename} is not bound by a valid 40-character candidateSha`;
      } else if (evidenceCandidateSha !== requestedCandidateSha) {
        reason = `${category.evidenceFilename} certifies ${evidenceCandidateSha}, not exact candidate ${requestedCandidateSha}`;
      } else if (evidence[category.passField] !== true) {
        reason = `${category.evidenceFilename} does not prove ${category.passField}=true`;
      } else {
        const issues = semanticIssues(category.id, evidence, requestedCandidateSha);
        if (issues.length) reason = issues.join("; ");
        else passed = true;
      }
    } catch {
      reason = `${category.evidenceFilename} is not valid JSON exact-candidate evidence`;
    }
  }

  categories.push({
    id: category.id,
    evidenceFilename: category.evidenceFilename,
    evidenceCandidateSha,
    passed,
    ...(reason ? { reason } : {}),
  });
}

const certified = categories.every((category) => category.passed);
const certification: V3S16CertificationEvidence = {
  schemaVersion: 1,
  candidateSha: requestedCandidateSha,
  certified,
  categories,
};

const outputPath = join(evidenceDir, "s16-certification.json");
writeFileSync(outputPath, `${JSON.stringify(certification, null, 2)}\n`, "utf8");

if (certified) {
  process.stdout.write(`S16 exact-SHA certification: CERTIFIED (${requestedCandidateSha})\n`);
} else {
  process.stdout.write(`S16 exact-SHA certification: BLOCKED (${requestedCandidateSha})\n`);
  for (const category of categories) {
    if (!category.passed) process.stdout.write(`- ${category.id}: ${category.reason || "not passed"}\n`);
  }
}
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requireCertified && !certified) process.exit(1);
