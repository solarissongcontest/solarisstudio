import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  validateV3S16SurfaceEvidence,
  type V3S16SurfaceCategory,
} from "../src/lib/v3-s16-surface-evidence-contract";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CATEGORIES = [
  "public-acceptance",
  "organizer-acceptance",
  "navigation-acceptance",
  "accessibility",
  "responsive-behavior",
] as const satisfies readonly V3S16SurfaceCategory[];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const requestedCategory = argument("--category") ?? "";
if (!CATEGORIES.includes(requestedCategory as V3S16SurfaceCategory)) {
  throw new Error(
    `--category must be one of: ${CATEGORIES.join(", ")}`,
  );
}
const category = requestedCategory as V3S16SurfaceCategory;

const inputArg = argument("--input");
if (!inputArg) throw new Error("--input <json-file> is required");
const inputPath = resolve(inputArg);
const requirePassed = process.argv.includes("--require-passed");

const candidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() ?? "";
if (!SHA_PATTERN.test(candidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
const checkedOutSha = currentCommitSha();
if (checkedOutSha !== candidateSha) {
  throw new Error(
    `V3_CANDIDATE_SHA ${candidateSha} does not match checked-out SHA ${checkedOutSha}`,
  );
}

const raw = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
if (!isRecord(raw)) throw new Error("surface evidence input must be a JSON object");
if (raw.schemaVersion !== 1) throw new Error("surface evidence input schemaVersion must be 1");
if (raw.category !== category) {
  throw new Error(`surface evidence input category must be ${category}`);
}
const inputCandidateSha =
  typeof raw.candidateSha === "string" ? raw.candidateSha.trim().toLowerCase() : "";
if (!SHA_PATTERN.test(inputCandidateSha)) {
  throw new Error("surface evidence input candidateSha must be one exact 40-character SHA");
}
if (inputCandidateSha !== candidateSha) {
  throw new Error(
    `surface evidence input certifies ${inputCandidateSha}, not exact candidate ${candidateSha}`,
  );
}
if (!Array.isArray(raw.cases)) throw new Error("surface evidence input cases must be an array");
if (!isRecord(raw.provenance)) throw new Error("surface evidence input provenance is required");

// The packer deliberately ignores any caller-supplied top-level pass claim.
// It constructs a provisional passing artifact and asks the canonical S16
// validator whether the explicit cases/provenance actually satisfy the category.
const provisional = {
  schemaVersion: 1 as const,
  candidateSha,
  category,
  passed: true,
  cases: raw.cases,
  provenance: raw.provenance,
};
const validationIssues = validateV3S16SurfaceEvidence(
  provisional,
  category,
  candidateSha,
);
const passed = validationIssues.length === 0;
const evidence = {
  ...provisional,
  passed,
  ...(validationIssues.length ? { validationIssues } : {}),
};

const evidenceDir = resolve(
  process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence",
);
mkdirSync(evidenceDir, { recursive: true });
const outputPath = join(evidenceDir, `s16-${category}.json`);
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

process.stdout.write(
  `S16 ${category} evidence: ${passed ? "PASS" : "BLOCKED"} (${candidateSha})\n`,
);
for (const issue of validationIssues) process.stdout.write(`- ${issue}\n`);
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requirePassed && !passed) process.exit(1);
