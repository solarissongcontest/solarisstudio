import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateV3S16SystemHardeningSourceArtifacts(
  value: unknown,
  sourceDirectory: string,
  expectedCandidateSha: string,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();
  const evidence = record(value);
  if (!evidence || !Array.isArray(evidence.phases)) {
    return ["system-hardening: cannot verify source artifacts without phases"];
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
        if (component.certificationClaim === true) {
          issues.push(`${label} artifact ${artifact} improperly claims final certification`);
        }
      } catch {
        issues.push(`${label} artifact ${artifact} is not valid JSON`);
      }
    }
  }

  return [...new Set(issues)];
}
