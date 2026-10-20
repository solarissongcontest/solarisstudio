import {
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "../../scripts/v3-s14-full-contest-spec";
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
const REQUIRED_S14_STAGES = V3_S14_STAGES.map((item) => item.id);
const REQUIRED_S14_INVARIANTS = V3_S14_INVARIANTS.map((item) => item.id);
const REQUIRED_S14_FAILURE_INJECTIONS = V3_S14_FAILURE_INJECTIONS.map((item) => item.id);
const REQUIRED_S14_CONTEST_EXTENSIONS = [
  "grand-final-qualifier-bridge",
  "grand-final-voting",
  "grand-final-results",
  "grand-final-publication",
] as const;
const REQUIRED_S15_INVENTORY_FIELDS = [
  "v3IntegrationAdapters",
  "edgeFunctions",
  "scheduledJobs",
  "physicalOwnershipDomains",
  "uniquePhysicalTables",
  "domainTableAssignments",
  "explicitlySharedTables",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function missingRequired(actual: string[] | null, required: readonly string[]): string[] {
  if (!actual) return [...required];
  const present = new Set(actual);
  return required.filter((item) => !present.has(item));
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
    if (evidence.partial !== false) {
      issues.push("full-contest-rehearsal: final evidence must explicitly prove partial=false");
    }
    if (evidence.runtimeFailure !== false) {
      issues.push("full-contest-rehearsal: final evidence must explicitly prove runtimeFailure=false");
    }

    const completedStages = stringArray(evidence.completedStages);
    const pendingStages = stringArray(evidence.pendingStages);
    const completedExtensions = stringArray(evidence.completedContestExtensions);
    const pendingExtensions = stringArray(evidence.pendingContestExtensions);
    const blockedExtensions = stringArray(evidence.blockedContestExtensions);
    const implementedInvariants = stringArray(evidence.implementedInvariants);
    const implementedFailures = stringArray(evidence.implementedFailureInjections);

    if (!completedStages) {
      issues.push("full-contest-rehearsal: completedStages must be a string array");
    } else {
      const missingStages = missingRequired(completedStages, REQUIRED_S14_STAGES);
      if (missingStages.length) {
        issues.push(`full-contest-rehearsal: completed lifecycle stages missing: ${missingStages.join(", ")}`);
      }
    }
    if (!pendingStages) {
      issues.push("full-contest-rehearsal: pendingStages must be a string array");
    } else if (pendingStages.length !== 0) {
      issues.push("full-contest-rehearsal: pending stages remain");
    }

    if (!completedExtensions) {
      issues.push("full-contest-rehearsal: completedContestExtensions must be a string array");
    } else {
      const missingExtensions = missingRequired(completedExtensions, REQUIRED_S14_CONTEST_EXTENSIONS);
      if (missingExtensions.length) {
        issues.push(`full-contest-rehearsal: completed contest extensions missing: ${missingExtensions.join(", ")}`);
      }
    }
    if (!pendingExtensions || pendingExtensions.length !== 0) {
      issues.push("full-contest-rehearsal: pending contest extensions remain or are not recorded");
    }
    if (!blockedExtensions || blockedExtensions.length !== 0) {
      issues.push("full-contest-rehearsal: blocked contest extensions remain or are not recorded");
    }

    const missingInvariants = missingRequired(implementedInvariants, REQUIRED_S14_INVARIANTS);
    if (missingInvariants.length) {
      issues.push(`full-contest-rehearsal: invariant evidence missing: ${missingInvariants.join(", ")}`);
    }
    const missingFailures = missingRequired(implementedFailures, REQUIRED_S14_FAILURE_INJECTIONS);
    if (missingFailures.length) {
      issues.push(`full-contest-rehearsal: failure-injection evidence missing: ${missingFailures.join(", ")}`);
    }

    const seed = record(evidence.seed);
    const seedShowCount = seed?.showCount;
    if (
      seed?.editionCount !== V3_S14_SEED_CONTRACT.editionCount ||
      seed?.delegationCount !== V3_S14_SEED_CONTRACT.delegationCount ||
      typeof seedShowCount !== "number" ||
      seedShowCount < V3_S14_SEED_CONTRACT.minimumShowCount
    ) {
      issues.push("full-contest-rehearsal: seed evidence does not match the canonical bounded S14 contest");
    }
  }

  if (categoryId === "registry-zero-gap") {
    if (evidence.zeroOrphans !== true) issues.push("registry-zero-gap: zeroOrphans is not true");
    if (typeof evidence.schemaVersion !== "number" || evidence.schemaVersion < 4) {
      issues.push("registry-zero-gap: S15 evidence schemaVersion is missing or predates physical-ownership evidence");
    }

    const findings = stringArray(evidence.findings);
    if (!findings) {
      issues.push("registry-zero-gap: findings must be a string array");
    } else if (findings.length !== 0) {
      issues.push("registry-zero-gap: orphan findings remain");
    }

    const inventory = record(evidence.inventory);
    if (!inventory) {
      issues.push("registry-zero-gap: concrete inventory is missing");
    } else {
      const missingInventory = REQUIRED_S15_INVENTORY_FIELDS.filter((field) => {
        const value = inventory[field];
        return typeof value !== "number" || !Number.isFinite(value) || value < 0;
      });
      if (missingInventory.length) {
        issues.push(`registry-zero-gap: concrete inventory fields missing or invalid: ${missingInventory.join(", ")}`);
      }
    }

    const physicalOwnership = record(evidence.physicalOwnership);
    if (physicalOwnership?.zeroOwnershipConflicts !== true) {
      issues.push("registry-zero-gap: physical ownership is not explicitly conflict-free");
    }
    if (typeof physicalOwnership?.schemaVersion !== "number") {
      issues.push("registry-zero-gap: physical ownership scanner provenance is missing");
    }
  }

  return [...new Set(issues)];
}
