import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";

export type V3S12CapacityQaEvidence = {
  schemaVersion: 1;
  candidateSha: string | null;
  passed: boolean;
  sourceStatus: string | null;
  canonicalScenarioCount: number;
  observedScenarioCount: number | null;
  readyScenarioCount: number | null;
  issues: readonly string[];
  certificationClaim: false;
};

type UnknownRecord = Record<string, unknown>;

const SHA_RE = /^[0-9a-f]{40}$/;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function exactSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHA_RE.test(normalized) ? normalized : null;
}

function emptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Convert the System-owned S12 capacity portfolio into a QA-owned exact-SHA
 * readiness verdict. This deliberately does not turn review readiness into a
 * release certification claim. It only proves whether the canonical scenario
 * portfolio is complete and internally coherent enough for Chat 5 to accept as
 * S12 evidence on the exact candidate SHA.
 */
export function assessV3S12CapacityQaEvidence(
  portfolioValue: unknown,
  expectedCandidateShaValue: unknown,
): V3S12CapacityQaEvidence {
  const issues: string[] = [];
  const expectedCandidateSha = exactSha(expectedCandidateShaValue);
  const portfolio = asRecord(portfolioValue);
  const canonicalScenarioCount = V3_CAPACITY_SCENARIOS.length;

  if (!expectedCandidateSha) {
    issues.push("expected candidate SHA must be exactly 40 hexadecimal characters");
  }

  if (!portfolio) {
    issues.push("capacity portfolio must be a JSON object");
    return {
      schemaVersion: 1,
      candidateSha: expectedCandidateSha,
      passed: false,
      sourceStatus: null,
      canonicalScenarioCount,
      observedScenarioCount: null,
      readyScenarioCount: null,
      issues,
      certificationClaim: false,
    };
  }

  const portfolioSha = exactSha(portfolio.expectedCommitSha);
  const sourceStatus = typeof portfolio.status === "string" ? portfolio.status : null;
  const reportedCanonicalCount = integer(portfolio.canonicalScenarioCount);
  const observedScenarioCount = integer(portfolio.observedScenarioCount);
  const readyScenarioCount = integer(portfolio.readyScenarioCount);

  if (portfolio.schemaVersion !== 1) {
    issues.push("capacity portfolio schemaVersion must be 1");
  }
  if (!portfolioSha) {
    issues.push("capacity portfolio expectedCommitSha must be an exact SHA");
  } else if (expectedCandidateSha && portfolioSha !== expectedCandidateSha) {
    issues.push(
      `capacity portfolio belongs to ${portfolioSha}, not exact candidate ${expectedCandidateSha}`,
    );
  }
  if (sourceStatus !== "ready_for_qa_review") {
    issues.push("capacity portfolio is not ready_for_qa_review");
  }
  if (portfolio.certificationClaim !== false) {
    issues.push("System capacity portfolio must not claim release certification");
  }
  if (portfolio.qaReviewRequired !== true) {
    issues.push("System capacity portfolio must explicitly require QA review");
  }

  if (reportedCanonicalCount !== canonicalScenarioCount) {
    issues.push(
      `capacity portfolio canonical scenario count ${String(reportedCanonicalCount)} does not match registry count ${canonicalScenarioCount}`,
    );
  }
  if (observedScenarioCount !== canonicalScenarioCount) {
    issues.push(
      `capacity portfolio observed ${String(observedScenarioCount)} of ${canonicalScenarioCount} canonical scenarios`,
    );
  }
  if (readyScenarioCount !== canonicalScenarioCount) {
    issues.push(
      `capacity portfolio has ${String(readyScenarioCount)} of ${canonicalScenarioCount} scenarios ready for QA review`,
    );
  }

  const requiredEmptyArrays = [
    ["missingScenarioIds", portfolio.missingScenarioIds],
    ["incompleteScenarioIds", portfolio.incompleteScenarioIds],
    ["invalidScenarioIds", portfolio.invalidScenarioIds],
    ["missingMeasurements", portfolio.missingMeasurements],
    ["missingExternalEvidenceDimensions", portfolio.missingExternalEvidenceDimensions],
    ["missingBudgetKeys", portfolio.missingBudgetKeys],
    ["errors", portfolio.errors],
  ] as const;

  for (const [field, value] of requiredEmptyArrays) {
    if (!emptyStringArray(value)) {
      issues.push(`capacity portfolio ${field} must be an empty array`);
    }
  }

  return {
    schemaVersion: 1,
    candidateSha: expectedCandidateSha,
    passed: issues.length === 0,
    sourceStatus,
    canonicalScenarioCount,
    observedScenarioCount,
    readyScenarioCount,
    issues,
    certificationClaim: false,
  };
}
