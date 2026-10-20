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

const S14_COMPLETE_STAGES = [
  "stage-1-setup",
  "stage-2-delegation-onboarding",
  "stage-3-confirmations",
  "stage-4-entries",
  "stage-5-running-orders",
  "stage-6-jury",
  "stage-7-public-voting",
  "stage-8-results",
  "stage-9-publication",
  "stage-10-archive",
] as const;

const S14_COMPLETE_EXTENSIONS = [
  "grand-final-qualifier-bridge",
  "grand-final-jury",
  "grand-final-televote",
  "grand-final-results",
  "grand-final-publication",
] as const;

const S14_REQUIRED_INVARIANTS = new Set([
  "confirmation-no-effective-duplicates",
  "entry-valid-revision",
  "media-accepted-revision",
  "jury-single-final-ballot",
  "televote-canonical-ballot",
  "result-reproducible",
  "publication-final-version",
  "tasks-canonical",
  "notifications-reconcilable",
  "grand-final-televote-source-parity",
  "grand-final-result-reproducible",
  "grand-final-publication-final-version",
]);

const S14_REQUIRED_FAILURE_INJECTIONS = new Set([
  "network-after-commit",
  "db-timeout-before-commit",
  "duplicate-request",
  "worker-crash",
  "realtime-disconnect",
  "stale-client",
  "two-organizers",
  "supabase-outage",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactStringArray(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function missingStrings(value: unknown, required: ReadonlySet<string>) {
  const actual = new Set(
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
  );
  return [...required].filter((item) => !actual.has(item));
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

  if (categoryId === "production-isolation") {
    const guard = record(evidence.guard);
    if (guard?.workflowPath !== ".github/workflows/ci.yml") {
      issues.push("production-isolation: evidence is not bound to canonical Quality workflow path");
    }
    if (guard?.scriptPath !== "scripts/check-v3-production-isolation.ts") {
      issues.push("production-isolation: evidence is not bound to canonical production-isolation guard");
    }
    if (guard?.invocationVerified !== true) {
      issues.push("production-isolation: exact-SHA Quality invocation of the isolation guard was not verified");
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
    const registryErrors = authorization?.registryErrors;
    if (!Array.isArray(registryErrors) || registryErrors.length !== 0) {
      issues.push("authorization-security: authorization registry has structural errors");
    }
    const incompleteVerifiedCommands = authorization?.incompleteVerifiedCommands;
    if (!Array.isArray(incompleteVerifiedCommands) || incompleteVerifiedCommands.length !== 0) {
      issues.push("authorization-security: verified commands have incomplete hostile-path evidence");
    }
    if (security?.exactCandidateSha !== true || security?.releaseReady !== true) {
      issues.push("authorization-security: security advisor classification is not exact-SHA release-ready");
    }
  }

  if (categoryId === "full-contest-rehearsal") {
    if (evidence.schemaVersion !== 2) {
      issues.push("full-contest-rehearsal: schemaVersion must be 2");
    }
    if (evidence.partial !== false) {
      issues.push("full-contest-rehearsal: final evidence must prove partial=false");
    }
    if (evidence.runtimeFailure !== false) {
      issues.push("full-contest-rehearsal: final evidence must prove runtimeFailure=false");
    }
    if (!exactStringArray(evidence.completedStages, S14_COMPLETE_STAGES)) {
      issues.push("full-contest-rehearsal: completedStages does not prove the canonical 10-stage lifecycle");
    }
    if (!Array.isArray(evidence.pendingStages) || evidence.pendingStages.length !== 0) {
      issues.push("full-contest-rehearsal: pending stages remain or are not explicitly reported");
    }
    if (!exactStringArray(evidence.completedContestExtensions, S14_COMPLETE_EXTENSIONS)) {
      issues.push("full-contest-rehearsal: Grand Final completion evidence is incomplete");
    }
    if (!Array.isArray(evidence.pendingContestExtensions) || evidence.pendingContestExtensions.length !== 0) {
      issues.push("full-contest-rehearsal: pending contest extensions remain or are not explicitly reported");
    }
    if (!Array.isArray(evidence.blockedContestExtensions) || evidence.blockedContestExtensions.length !== 0) {
      issues.push("full-contest-rehearsal: blocked contest extensions remain or are not explicitly reported");
    }

    const missingInvariants = missingStrings(evidence.implementedInvariants, S14_REQUIRED_INVARIANTS);
    if (missingInvariants.length) {
      issues.push(`full-contest-rehearsal: required invariants missing: ${missingInvariants.join(", ")}`);
    }
    const missingFailures = missingStrings(
      evidence.implementedFailureInjections,
      S14_REQUIRED_FAILURE_INJECTIONS,
    );
    if (missingFailures.length) {
      issues.push(`full-contest-rehearsal: required failure injections missing: ${missingFailures.join(", ")}`);
    }

    const seed = record(evidence.seed);
    if (seed?.editionCount !== 1 || seed?.delegationCount !== 66 || seed?.showCount !== 3) {
      issues.push("full-contest-rehearsal: seed evidence must prove one edition, 66 delegations and three shows");
    }
  }

  if (categoryId === "registry-zero-gap") {
    if (typeof evidence.schemaVersion !== "number" || evidence.schemaVersion < 4) {
      issues.push("registry-zero-gap: schemaVersion must include final cross-system and physical-ownership evidence");
    }
    if (evidence.zeroOrphans !== true) issues.push("registry-zero-gap: zeroOrphans is not true");
    if (!Array.isArray(evidence.findings) || evidence.findings.length !== 0) {
      issues.push("registry-zero-gap: orphan findings remain or findings are not explicitly reported");
    }
    if (!record(evidence.inventory)) {
      issues.push("registry-zero-gap: canonical inventory is missing");
    }
    const physicalOwnership = record(evidence.physicalOwnership);
    if (physicalOwnership?.zeroOwnershipConflicts !== true) {
      issues.push("registry-zero-gap: physical ownership is not conflict-free");
    }
    if (typeof physicalOwnership?.schemaVersion !== "number") {
      issues.push("registry-zero-gap: physical ownership schema evidence is missing");
    }
  }

  return [...new Set(issues)];
}
