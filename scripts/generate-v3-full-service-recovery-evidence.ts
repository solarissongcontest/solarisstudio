import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { assessV3FullServiceRecoveryEvidence } from "../src/lib/v3-full-service-recovery-evidence";

type UnknownRecord = Record<string, unknown>;

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${label} from ${path}: ${message}`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as UnknownRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function verifyComponentArtifacts(manifestValue: unknown): string[] {
  const errors: string[] = [];
  const manifest = asRecord(manifestValue);
  const components = manifest?.components;
  if (!Array.isArray(components)) return errors;

  const repositoryRoot = resolve(process.cwd());

  for (const [index, rawComponent] of components.entries()) {
    const component = asRecord(rawComponent);
    if (!component) continue;
    const componentId =
      typeof component.component === "string" && component.component.trim()
        ? component.component.trim()
        : `components[${index}]`;
    const artifactPath =
      typeof component.artifactPath === "string" ? component.artifactPath.trim() : "";
    const expectedDigest =
      typeof component.artifactSha256 === "string"
        ? component.artifactSha256.trim().toLowerCase()
        : "";
    const embeddedAssessment = component.assessment;

    if (!artifactPath || !/^[0-9a-f]{64}$/i.test(expectedDigest)) continue;

    const resolvedArtifact = resolve(repositoryRoot, artifactPath);
    const relativeArtifact = relative(repositoryRoot, resolvedArtifact);
    if (
      relativeArtifact === "" ||
      relativeArtifact === ".." ||
      relativeArtifact.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      errors.push(`${componentId} assessment artifact escapes the repository root`);
      continue;
    }

    let rawArtifact: Buffer;
    try {
      rawArtifact = readFileSync(resolvedArtifact);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${componentId} assessment artifact could not be read: ${message}`);
      continue;
    }

    const actualDigest = createHash("sha256").update(rawArtifact).digest("hex");
    if (actualDigest !== expectedDigest) {
      errors.push(`${componentId} assessment artifact digest does not match artifactSha256`);
      continue;
    }

    let retainedAssessment: unknown;
    try {
      retainedAssessment = JSON.parse(rawArtifact.toString("utf8"));
    } catch {
      errors.push(`${componentId} assessment artifact is not valid JSON`);
      continue;
    }

    if (canonicalJson(retainedAssessment) !== canonicalJson(embeddedAssessment)) {
      errors.push(`${componentId} embedded assessment does not match retained artifact`);
    }
  }

  return errors;
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
    ? verifyComponentArtifacts(manifest)
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
