import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

type UnknownRecord = Record<string, unknown>;
type ArtifactReader = (path: string) => Buffer;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
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

function staysInsideRoot(root: string, target: string) {
  const relativeTarget = relative(root, target);
  return (
    relativeTarget !== "" &&
    relativeTarget !== ".." &&
    !relativeTarget.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  );
}

export function verifyV3FullServiceRecoveryArtifacts(
  manifestValue: unknown,
  repositoryRootValue: string = process.cwd(),
  readArtifact: ArtifactReader = readFileSync,
): string[] {
  const errors: string[] = [];
  const manifest = asRecord(manifestValue);
  const components = manifest?.components;
  if (!Array.isArray(components)) return errors;

  const repositoryRoot = resolve(repositoryRootValue);

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
    if (!staysInsideRoot(repositoryRoot, resolvedArtifact)) {
      errors.push(`${componentId} assessment artifact escapes the repository root`);
      continue;
    }

    let rawArtifact: Buffer;
    try {
      rawArtifact = readArtifact(resolvedArtifact);
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
