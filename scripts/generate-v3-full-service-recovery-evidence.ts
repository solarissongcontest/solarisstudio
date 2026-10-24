import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV3FullServiceRecoveryEvidence } from "../src/lib/v3-full-service-recovery-evidence";
import { verifyV3FullServiceRecoveryArtifacts } from "./lib/v3-full-service-recovery-artifacts";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${label} from ${path}: ${message}`);
  }
}

const inputPath = argument("--input");
const expectedSha = argument("--expected-sha");
const outputPath = argument("--output");
const requireReady = hasFlag("--require-ready");

if (!inputPath || !expectedSha) {
  throw new Error(
    "Usage: bun scripts/generate-v3-full-service-recovery-evidence.ts --input <manifest.json> --expected-sha <40-char-sha> [--output <assessment.json>] [--require-ready]",
  );
}

const manifest = readJson(inputPath, "S11 full-service recovery manifest");
const structuralAssessment = assessV3FullServiceRecoveryEvidence(manifest, expectedSha);
const provenanceErrors =
  structuralAssessment.errors.length === 0 &&
  structuralAssessment.missingComponents.length === 0
    ? verifyV3FullServiceRecoveryArtifacts(manifest)
    : [];
const assessment =
  provenanceErrors.length > 0
    ? {
        ...structuralAssessment,
        status: "invalid" as const,
        errors: [...structuralAssessment.errors, ...provenanceErrors],
        artifactProvenanceVerified: false,
      }
    : {
        ...structuralAssessment,
        artifactProvenanceVerified:
          structuralAssessment.missingComponents.length === 0 &&
          structuralAssessment.errors.length === 0,
      };
const output = `${JSON.stringify(assessment, null, 2)}\n`;

if (outputPath) {
  writeFileSync(resolve(process.cwd(), outputPath), output, "utf8");
} else {
  process.stdout.write(output);
}

if (
  requireReady &&
  (assessment.status !== "ready_for_qa_review" || !assessment.artifactProvenanceVerified)
) {
  process.stderr.write(
    `S11 full-service recovery evidence is ${assessment.status}; refusing readiness claim.\n`,
  );
  process.exitCode = 1;
}
