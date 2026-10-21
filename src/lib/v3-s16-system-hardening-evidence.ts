export const V3_S16_SYSTEM_HARDENING_PHASES = ["S10", "S11", "S12", "S13"] as const;
export type V3S16SystemHardeningPhaseId = (typeof V3_S16_SYSTEM_HARDENING_PHASES)[number];

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

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

export function validateV3S16SystemHardeningEvidence(
  value: unknown,
  expectedCandidateSha: string,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["system-hardening: evidence must be a JSON object"];
  }

  const evidence = value as Record<string, unknown>;
  if (evidence.schemaVersion !== 1) {
    issues.push("system-hardening: schemaVersion must be 1");
  }
  if (evidence.certificationClaim !== false) {
    issues.push("system-hardening: component evidence must explicitly set certificationClaim=false");
  }

  const unresolvedBlockers = stringArray(evidence.unresolvedBlockers);
  if (!unresolvedBlockers) {
    issues.push("system-hardening: unresolvedBlockers must be a string array");
  } else if (unresolvedBlockers.length !== 0) {
    issues.push("system-hardening: unresolved blockers remain");
  }

  if (!Array.isArray(evidence.phases)) {
    issues.push("system-hardening: phases must be an array");
    return issues;
  }

  const phases = evidence.phases as unknown[];
  for (const requiredId of V3_S16_SYSTEM_HARDENING_PHASES) {
    const matches = phases.filter((phase) => record(phase)?.id === requiredId);
    if (matches.length !== 1) {
      issues.push(`system-hardening: expected exactly one ${requiredId} phase; found ${matches.length}`);
      continue;
    }

    const phase = record(matches[0]);
    if (!phase) continue;
    if (phase.passed !== true) {
      issues.push(`system-hardening: ${requiredId} does not prove passed=true`);
    }

    const phaseSha = typeof phase.candidateSha === "string" ? phase.candidateSha.trim().toLowerCase() : "";
    if (!SHA_PATTERN.test(phaseSha)) {
      issues.push(`system-hardening: ${requiredId} candidateSha must be one exact 40-character SHA`);
    } else if (phaseSha !== expectedSha) {
      issues.push(`system-hardening: ${requiredId} certifies ${phaseSha}, not exact candidate ${expectedSha}`);
    }

    const blockers = stringArray(phase.blockers);
    if (!blockers) {
      issues.push(`system-hardening: ${requiredId} blockers must be a string array`);
    } else if (blockers.length !== 0) {
      issues.push(`system-hardening: ${requiredId} still has blockers`);
    }

    if (!Array.isArray(phase.sources) || phase.sources.length === 0) {
      issues.push(`system-hardening: ${requiredId} must retain at least one exact-SHA source artifact`);
      continue;
    }

    for (const [index, sourceValue] of phase.sources.entries()) {
      const source = record(sourceValue);
      const label = `system-hardening: ${requiredId} source ${index + 1}`;
      if (!source) {
        issues.push(`${label} must be an object`);
        continue;
      }

      if (typeof source.artifact !== "string" || !source.artifact.trim()) {
        issues.push(`${label} artifact is missing`);
      }
      const digest = typeof source.sha256 === "string" ? source.sha256.trim().toLowerCase() : "";
      if (!DIGEST_PATTERN.test(digest)) {
        issues.push(`${label} sha256 must be 64 lowercase hex characters`);
      }
      if (typeof source.workflow !== "string" || !source.workflow.trim()) {
        issues.push(`${label} workflow is missing`);
      }
      if (!Number.isInteger(source.runId) || Number(source.runId) <= 0) {
        issues.push(`${label} runId must be a positive integer`);
      }
      if (!Number.isInteger(source.runAttempt) || Number(source.runAttempt) <= 0) {
        issues.push(`${label} runAttempt must be a positive integer`);
      }
      if (source.conclusion !== "success") {
        issues.push(`${label} conclusion must be success`);
      }
      const headSha = typeof source.headSha === "string" ? source.headSha.trim().toLowerCase() : "";
      if (!SHA_PATTERN.test(headSha)) {
        issues.push(`${label} headSha must be one exact 40-character SHA`);
      } else if (headSha !== expectedSha) {
        issues.push(`${label} ran on ${headSha}, not exact candidate ${expectedSha}`);
      }
    }
  }

  for (const phaseValue of phases) {
    const phase = record(phaseValue);
    const id = typeof phase?.id === "string" ? phase.id : "";
    if (!V3_S16_SYSTEM_HARDENING_PHASES.includes(id as V3S16SystemHardeningPhaseId)) {
      issues.push(`system-hardening: unknown phase ${id || "<missing>"}`);
    }
  }

  if (phases.length !== V3_S16_SYSTEM_HARDENING_PHASES.length) {
    issues.push(
      `system-hardening: expected exactly ${V3_S16_SYSTEM_HARDENING_PHASES.length} phases; found ${phases.length}`,
    );
  }

  return [...new Set(issues)];
}
