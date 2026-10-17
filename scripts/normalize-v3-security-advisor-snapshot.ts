import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const allowedLevels = new Set(["INFO", "WARN", "ERROR"]);

type JsonRecord = Record<string, unknown>;
type RawFinding = {
  detail?: unknown;
  metadata?: unknown;
};
type RawLint = {
  name?: unknown;
  title?: unknown;
  level?: unknown;
  findings?: unknown;
};
type AdvisorEnvelope = { lints: RawLint[] };
type CanonicalFinding = {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  title: string;
  object?: string;
  detail?: string;
};

function fail(message: string): never {
  throw new Error(`[v3-security-snapshot] ${message}`);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    fail(`cannot parse ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJson(path: string): unknown {
  try {
    return parseJson(readFileSync(path, "utf8"), path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[v3-security-snapshot]")) throw error;
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapAdvisorEnvelope(value: unknown): AdvisorEnvelope {
  if (typeof value === "string") return unwrapAdvisorEnvelope(parseJson(value, "embedded advisor payload"));
  if (!isRecord(value)) fail("advisor input must be a JSON object");

  if (Array.isArray(value.lints)) return { lints: value.lints as RawLint[] };
  if (isRecord(value.result) && Array.isArray(value.result.lints)) {
    return { lints: value.result.lints as RawLint[] };
  }
  if (typeof value.text === "string") return unwrapAdvisorEnvelope(value.text);

  fail("advisor input must contain lints, result.lints, or an embedded JSON text payload");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function findingObject(metadata: JsonRecord): string | undefined {
  const schema = typeof metadata.schema === "string" ? metadata.schema.trim() : "";
  const name = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const entity = typeof metadata.entity === "string" ? metadata.entity.trim() : "";
  const args = typeof metadata.arguments === "string" ? metadata.arguments.trim() : "";

  if (schema && name) return `${schema}.${name}${args ? `(${args})` : ""}`;
  if (name) return `${name}${args ? `(${args})` : ""}`;
  if (entity) return entity;
  return undefined;
}

function stableFindingId(lintName: string, metadata: JsonRecord, detail: string): string {
  // Advisor timestamps are intentionally outside metadata. Prefer the structured
  // object identity so wording changes do not invalidate reviewed dispositions.
  const stableIdentity = Object.keys(metadata).length > 0 ? stableJson(metadata) : detail;
  const digest = createHash("sha256")
    .update(`${lintName}\n${stableIdentity}`)
    .digest("hex")
    .slice(0, 20);
  return `${lintName}:${digest}`;
}

const inputPath = process.env.V3_SECURITY_ADVISOR_RAW;
const projectRef = process.env.V3_SECURITY_ADVISOR_PROJECT_REF?.trim();
const outputPath =
  process.env.V3_SECURITY_ADVISOR_SNAPSHOT ??
  "v3-release-evidence/security-advisor-snapshot.json";

if (!inputPath) fail("V3_SECURITY_ADVISOR_RAW is required");
if (!projectRef) fail("V3_SECURITY_ADVISOR_PROJECT_REF is required");

const envelope = unwrapAdvisorEnvelope(readJson(inputPath));
const findings: CanonicalFinding[] = [];
const ids = new Set<string>();

for (const lint of envelope.lints) {
  const lintName = typeof lint.name === "string" ? lint.name.trim() : "";
  const lintTitle = typeof lint.title === "string" ? lint.title.trim() : "";
  const level = typeof lint.level === "string" ? lint.level.trim().toUpperCase() : "";
  if (!lintName) fail("every advisor lint family requires a name");
  if (!lintTitle) fail(`advisor lint ${lintName} requires a title`);
  if (!allowedLevels.has(level)) fail(`unsupported advisor level for ${lintName}: ${level || "<missing>"}`);
  if (!Array.isArray(lint.findings)) fail(`advisor lint ${lintName} requires a findings array`);

  for (const rawFinding of lint.findings as RawFinding[]) {
    if (!isRecord(rawFinding)) fail(`advisor lint ${lintName} contains a non-object finding`);
    const detail = typeof rawFinding.detail === "string" ? rawFinding.detail.trim() : "";
    const metadata = isRecord(rawFinding.metadata) ? rawFinding.metadata : {};
    if (!detail) fail(`advisor lint ${lintName} contains a finding without detail`);

    const id = stableFindingId(lintName, metadata, detail);
    if (ids.has(id)) {
      fail(`duplicate stable advisor finding id ${id}; structured metadata is not unique enough`);
    }
    ids.add(id);

    const object = findingObject(metadata);
    findings.push({
      id,
      level: level as CanonicalFinding["level"],
      title: lintTitle,
      ...(object ? { object } : {}),
      detail,
    });
  }
}

findings.sort((a, b) => a.id.localeCompare(b.id));
const snapshot = {
  schemaVersion: 1 as const,
  projectRef,
  findings,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(
  `V3 security advisor snapshot: ${findings.length} findings across ${envelope.lints.length} lint families -> ${outputPath}\n`,
);
