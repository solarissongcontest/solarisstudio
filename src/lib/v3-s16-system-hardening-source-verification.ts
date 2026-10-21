import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sourceRunId(sourceDirectory: string): number | null {
  let current = sourceDirectory;
  while (true) {
    const match = /^run-(\d+)$/.exec(basename(current));
    if (match) return Number(match[1]);
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function runMetadataById(value: unknown): Map<number, Record<string, unknown>> {
  const result = new Map<number, Record<string, unknown>>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const metadata = record(item);
    if (!metadata || !Number.isInteger(metadata.runId) || Number(metadata.runId) <= 0) continue;
    result.set(Number(metadata.runId), metadata);
  }
  return result;
}

export function validateV3S16SystemHardeningSourceArtifacts(
  value: unknown,
  sourceDirectory: string,
  expectedCandidateSha: string,
  sourceRunMetadata?: unknown,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();
  const evidence = record(value);
  if (!evidence || !Array.isArray(evidence.phases)) {
    return ["system-hardening: cannot verify source artifacts without phases"];
  }

  const metadataByRunId = runMetadataById(sourceRunMetadata);
  const containingRunId = sourceRunId(sourceDirectory);
  const containingRun = containingRunId === null ? null : metadataByRunId.get(containingRunId) ?? null;
  if (sourceRunMetadata !== undefined) {
    if (containingRunId === null) {
      issues.push("system-hardening: evidence source directory is not nested under a declared run-<id> directory");
    } else if (!containingRun) {
      issues.push(`system-hardening: no trusted run metadata exists for containing Actions run ${containingRunId}`);
    }
  }

  for (const phaseValue of evidence.phases) {
    const phase = record(phaseValue);
    const phaseId = typeof phase?.id === "string" ? phase.id : "<missing>";
    if (!phase || !Array.isArray(phase.sources)) continue;

    for (const [index, sourceValue] of phase.sources.entries()) {
      const source = record(sourceValue);
      if (!source) continue;
      const label = `system-hardening: ${phaseId} source ${index + 1}`;
      const artifact = typeof source.artifact === "string" ? source.artifact.trim() : "";
      if (!artifact) continue;
      if (basename(artifact) !== artifact || artifact === "s16-system-hardening.json") {
        issues.push(`${label} artifact must be a non-self-referential filename in the evidence source directory`);
        continue;
      }

      const path = join(sourceDirectory, artifact);
      if (!existsSync(path) || !statSync(path).isFile()) {
        issues.push(`${label} artifact is missing from its evidence source: ${artifact}`);
        continue;
      }

      const bytes = readFileSync(path);
      const actualDigest = createHash("sha256").update(bytes).digest("hex");
      const declaredDigest = typeof source.sha256 === "string" ? source.sha256.trim().toLowerCase() : "";
      if (!DIGEST_PATTERN.test(declaredDigest) || actualDigest !== declaredDigest) {
        issues.push(`${label} artifact digest does not match ${artifact}`);
      }

      if (!artifact.endsWith(".json")) {
        issues.push(`${label} source artifact must be JSON exact-SHA evidence`);
        continue;
      }

      try {
        const component = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
        const componentSha =
          typeof component.candidateSha === "string"
            ? component.candidateSha.trim().toLowerCase()
            : "";
        if (!SHA_PATTERN.test(componentSha)) {
          issues.push(`${label} artifact ${artifact} lacks a valid candidateSha`);
        } else if (componentSha !== expectedSha) {
          issues.push(`${label} artifact ${artifact} certifies ${componentSha}, not exact candidate ${expectedSha}`);
        }
        if (component.passed !== true) {
          issues.push(`${label} artifact ${artifact} does not prove passed=true`);
        }
        if (component.certificationClaim !== false) {
          issues.push(`${label} artifact ${artifact} must explicitly set certificationClaim=false`);
        }
        if (Array.isArray(component.issues) && component.issues.length !== 0) {
          issues.push(`${label} artifact ${artifact} still contains QA issues`);
        }
      } catch {
        issues.push(`${label} artifact ${artifact} is not valid JSON`);
      }

      if (sourceRunMetadata !== undefined) {
        const declaredRunId = Number.isInteger(source.runId) ? Number(source.runId) : null;
        if (declaredRunId !== containingRunId) {
          issues.push(
            `${label} declares runId ${String(declaredRunId)}, but artifact was downloaded from run ${String(containingRunId)}`,
          );
        }
        if (containingRun) {
          const metadataHeadSha =
            typeof containingRun.headSha === "string" ? containingRun.headSha.trim().toLowerCase() : "";
          if (metadataHeadSha !== expectedSha) {
            issues.push(`${label} trusted Actions run metadata is not bound to exact candidate ${expectedSha}`);
          }
          if (containingRun.conclusion !== "success") {
            issues.push(`${label} trusted Actions run conclusion is not success`);
          }
          if (source.workflow !== containingRun.workflow) {
            issues.push(`${label} workflow does not match trusted Actions run metadata`);
          }
          if (source.runAttempt !== containingRun.runAttempt) {
            issues.push(`${label} runAttempt does not match trusted Actions run metadata`);
          }
          const declaredHeadSha =
            typeof source.headSha === "string" ? source.headSha.trim().toLowerCase() : "";
          if (declaredHeadSha !== metadataHeadSha) {
            issues.push(`${label} headSha does not match trusted Actions run metadata`);
          }
          if (source.conclusion !== containingRun.conclusion) {
            issues.push(`${label} conclusion does not match trusted Actions run metadata`);
          }
        }
      }
    }
  }

  return [...new Set(issues)];
}
