import {
  V3_S14_CONTEST_EXTENSIONS,
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_FINAL_LIFECYCLE_STATE,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "./v3-s14-full-contest-spec";

export type V3S14Evidence = Record<string, unknown>;

export type ValidateV3S14EvidenceOptions = {
  candidateSha: string;
  evidence: V3S14Evidence;
  requireComplete?: boolean;
};

const stageIds = V3_S14_STAGES.map((stage) => stage.id);
const extensionIds = [...V3_S14_CONTEST_EXTENSIONS];
const invariantIds = V3_S14_INVARIANTS.map((item) => item.id);
const failureInjectionIds = V3_S14_FAILURE_INJECTIONS.map((item) => item.id);
const sensitiveKeyPattern = /(?:authorization|cookie|password|secret|service.?role.?key|access.?token|refresh.?token|api.?key)/i;

function fail(message: string): never {
  throw new Error(`Invalid S14 evidence: ${message}`);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail(`${field} must be a string array`);
  }
  return value as string[];
}

function assertExactArray(actual: string[], expected: readonly string[], field: string) {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    fail(`${field} must equal canonical order [${expected.join(", ")}], got [${actual.join(", ")}]`);
  }
}

function assertRequiredMembers(actual: string[], required: readonly string[], field: string) {
  const missing = required.filter((value) => !actual.includes(value));
  if (missing.length > 0) fail(`${field} is missing required values: ${missing.join(", ")}`);
}

function assertCanonicalSubset(actual: string[], canonical: readonly string[], field: string) {
  const unknown = actual.filter((value) => !canonical.includes(value));
  if (unknown.length > 0) fail(`${field} contains non-canonical values: ${unknown.join(", ")}`);
  if (new Set(actual).size !== actual.length) fail(`${field} contains duplicates`);
}

function assertPrefix(actual: string[], canonical: readonly string[], field: string) {
  assertCanonicalSubset(actual, canonical, field);
  if (actual.some((value, index) => value !== canonical[index])) {
    fail(`${field} must be a canonical completion prefix`);
  }
}

function assertSanitized(value: unknown, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) fail(`${path}.${key} is not allowed in sanitized release evidence`);
    assertSanitized(child, `${path}.${key}`);
  }
}

function validateIdentity(candidateSha: string, evidence: V3S14Evidence) {
  const normalizedSha = candidateSha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalizedSha)) fail(`candidateSha is not a full 40-character Git SHA: ${candidateSha}`);
  if (evidence.candidateSha !== normalizedSha) {
    fail(`candidate SHA mismatch: ${String(evidence.candidateSha)} != ${normalizedSha}`);
  }

  const runIdentity = asRecord(evidence.runIdentity, "runIdentity");
  if (runIdentity.candidateSha !== normalizedSha) fail("runIdentity.candidateSha does not match exact candidate");
  if (typeof runIdentity.runId !== "string" || !runIdentity.runId) fail("runIdentity.runId is missing");
  if (typeof runIdentity.databaseFingerprint !== "string" || !runIdentity.databaseFingerprint) {
    fail("runIdentity.databaseFingerprint is missing");
  }
}

function validateProgress(evidence: V3S14Evidence) {
  const completedStages = asStringArray(evidence.completedStages, "completedStages");
  const pendingStages = asStringArray(evidence.pendingStages, "pendingStages");
  const completedExtensions = asStringArray(evidence.completedContestExtensions, "completedContestExtensions");
  const pendingExtensions = asStringArray(evidence.pendingContestExtensions, "pendingContestExtensions");
  const blockedExtensions = asStringArray(evidence.blockedContestExtensions, "blockedContestExtensions");

  assertPrefix(completedStages, stageIds, "completedStages");
  assertCanonicalSubset(pendingStages, stageIds, "pendingStages");
  assertPrefix(completedExtensions, extensionIds, "completedContestExtensions");
  assertCanonicalSubset(pendingExtensions, extensionIds, "pendingContestExtensions");
  assertCanonicalSubset(blockedExtensions, extensionIds, "blockedContestExtensions");

  const expectedPendingStages = stageIds.filter((stage) => !completedStages.includes(stage));
  const expectedPendingExtensions = extensionIds.filter((extension) => !completedExtensions.includes(extension));
  assertExactArray(pendingStages, expectedPendingStages, "pendingStages");
  assertExactArray(pendingExtensions, expectedPendingExtensions, "pendingContestExtensions");

  if (blockedExtensions.some((extension) => !pendingExtensions.includes(extension))) {
    fail("blockedContestExtensions may only contain pending extensions");
  }

  for (const [field, canonical] of [
    ["implementedInvariants", invariantIds],
    ["implementedFailureInjections", failureInjectionIds],
  ] as const) {
    if (evidence[field] !== undefined) {
      assertCanonicalSubset(asStringArray(evidence[field], field), canonical, field);
    }
  }

  return { completedStages, pendingStages, completedExtensions, pendingExtensions, blockedExtensions };
}

function validateSeed(evidence: V3S14Evidence) {
  const seed = asRecord(evidence.seed, "seed");
  if (seed.editionCount !== V3_S14_SEED_CONTRACT.editionCount) fail("seed.editionCount is not canonical");
  if (seed.delegationCount !== V3_S14_SEED_CONTRACT.delegationCount) fail("seed.delegationCount is not canonical");
  if (typeof seed.showCount !== "number" || seed.showCount < V3_S14_SEED_CONTRACT.minimumShowCount) {
    fail("seed.showCount does not satisfy the canonical minimum");
  }
}

function validateCompleteEvidence(evidence: V3S14Evidence) {
  if (evidence.passed !== true || evidence.partial !== false || evidence.runtimeFailure !== false) {
    fail("complete evidence must be passed=true, partial=false, runtimeFailure=false");
  }

  const progress = validateProgress(evidence);
  assertExactArray(progress.completedStages, stageIds, "completedStages");
  assertExactArray(progress.pendingStages, [], "pendingStages");
  assertExactArray(progress.completedExtensions, extensionIds, "completedContestExtensions");
  assertExactArray(progress.pendingExtensions, [], "pendingContestExtensions");
  assertExactArray(progress.blockedExtensions, [], "blockedContestExtensions");

  const lifecycle = asRecord(evidence.lifecycle, "lifecycle");
  if (lifecycle.finalState !== V3_S14_FINAL_LIFECYCLE_STATE) {
    fail(`lifecycle.finalState must be ${V3_S14_FINAL_LIFECYCLE_STATE}`);
  }

  const implementedInvariants = asStringArray(evidence.implementedInvariants, "implementedInvariants");
  const implementedFailures = asStringArray(evidence.implementedFailureInjections, "implementedFailureInjections");
  assertRequiredMembers(implementedInvariants, invariantIds, "implementedInvariants");
  assertRequiredMembers(implementedFailures, failureInjectionIds, "implementedFailureInjections");

  if (!progress.completedStages.includes("stage-10-archive")) fail("Archive stage is not complete");
  if (!progress.completedExtensions.includes("grand-final-publication")) fail("Grand Final publication is not complete");
  if (evidence.failurePhase !== undefined || evidence.failureStage !== undefined) {
    fail("successful evidence must not retain failure phase/stage");
  }
}

function validateFailureEvidence(evidence: V3S14Evidence) {
  if (evidence.passed !== false || evidence.partial !== true || evidence.runtimeFailure !== true) {
    fail("runtime failure evidence must remain passed=false, partial=true, runtimeFailure=true");
  }
  validateProgress(evidence);

  if (typeof evidence.failurePhase !== "string" || !evidence.failurePhase || evidence.failurePhase === "unknown") {
    fail("runtime failure evidence requires a concrete failurePhase");
  }
  if (typeof evidence.failureStage !== "string" || !evidence.failureStage) {
    fail("runtime failure evidence requires failureStage diagnostics");
  }
  if (typeof evidence.exitCode !== "number" || evidence.exitCode === 0) {
    fail("runtime failure evidence requires a non-zero exitCode diagnostic");
  }

  if (evidence.lifecycle !== undefined) {
    const lifecycle = asRecord(evidence.lifecycle, "lifecycle");
    if (lifecycle.finalState === V3_S14_FINAL_LIFECYCLE_STATE) {
      fail("runtime failure evidence must not manufacture archived completion");
    }
  }
}

export function validateV3S14Evidence({
  candidateSha,
  evidence,
  requireComplete = false,
}: ValidateV3S14EvidenceOptions): V3S14Evidence {
  assertSanitized(evidence);
  validateIdentity(candidateSha, evidence);
  validateSeed(evidence);

  if (requireComplete) {
    validateCompleteEvidence(evidence);
  } else if (evidence.passed === true) {
    validateCompleteEvidence(evidence);
  } else {
    validateFailureEvidence(evidence);
  }

  return evidence;
}
