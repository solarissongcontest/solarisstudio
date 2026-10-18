import { V3_S16_CERTIFICATION_CATEGORIES } from "./v3-s16-certification-contract";
import {
  validateV3S16SurfaceEvidence,
  type V3S16SurfaceCategory,
} from "./v3-s16-surface-evidence-contract";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SURFACE_CATEGORIES = new Set<V3S16SurfaceCategory>([
  "public-acceptance",
  "organizer-acceptance",
  "navigation-acceptance",
  "accessibility",
  "responsive-behavior",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateV3S16CategorySourceEvidence(
  categoryId: string,
  value: unknown,
  expectedCandidateSha: string,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();
  const category = V3_S16_CERTIFICATION_CATEGORIES.find((item) => item.id === categoryId);

  if (!category) return [`unknown S16 certification category: ${categoryId}`];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${categoryId}: source evidence must be a JSON object`];
  }

  const evidence = value as Record<string, unknown>;
  const candidateSha =
    typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";
  if (!SHA_PATTERN.test(candidateSha)) {
    issues.push(`${categoryId}: source evidence candidateSha must be 40 lowercase hex characters`);
  } else if (candidateSha !== expectedSha) {
    issues.push(`${categoryId}: source evidence certifies ${candidateSha}, not exact candidate ${expectedSha}`);
  }

  if (evidence[category.passField] !== true) {
    issues.push(`${categoryId}: source evidence does not prove ${category.passField}=true`);
  }

  if (SURFACE_CATEGORIES.has(categoryId as V3S16SurfaceCategory)) {
    issues.push(
      ...validateV3S16SurfaceEvidence(
        evidence,
        categoryId as V3S16SurfaceCategory,
        expectedSha,
      ),
    );
    return [...new Set(issues)];
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
    if (!Array.isArray(authorization?.incompleteVerifiedCommands) || authorization.incompleteVerifiedCommands.length !== 0) {
      issues.push("authorization-security: verified commands have incomplete hostile-path evidence");
    }
    if (security?.exactCandidateSha !== true || security?.releaseReady !== true) {
      issues.push("authorization-security: security advisor classification is not exact-SHA release-ready");
    }
  }

  if (categoryId === "full-contest-rehearsal") {
    if (evidence.partial === true) issues.push("full-contest-rehearsal: partial evidence cannot certify S16");
    if (evidence.runtimeFailure === true) {
      issues.push("full-contest-rehearsal: runtime failure evidence cannot certify S16");
    }
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

  return [...new Set(issues)];
}
