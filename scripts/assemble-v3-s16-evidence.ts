import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { V3_S16_CERTIFICATION_CATEGORIES } from "../src/lib/v3-s16-certification-contract";
import { validateV3S16CategorySourceEvidence } from "../src/lib/v3-s16-evidence-validation";
import { validateV3S16SystemHardeningSourceArtifacts } from "../src/lib/v3-s16-system-hardening-source-verification";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const requireComplete = process.argv.includes("--require-complete");

function valuesFor(flag: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim()
    .toLowerCase();
}

function readRunMetadata() {
  const path = process.env.V3_S16_SOURCE_RUN_METADATA?.trim();
  if (!path) return undefined;
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`S16 source-run metadata file does not exist: ${path}`);
  const entries = readFileSync(resolved, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`S16 source-run metadata line ${index + 1} is not valid JSON`);
      }
    });
  if (!entries.length) throw new Error("S16 source-run metadata is empty");
  return entries;
}

const candidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() ?? "";
if (!SHA_PATTERN.test(candidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
const checkedOutSha = currentCommitSha();
if (checkedOutSha !== candidateSha) {
  throw new Error(`V3_CANDIDATE_SHA ${candidateSha} does not match checked-out SHA ${checkedOutSha}`);
}

const sourceArgs = valuesFor("--source");
if (!sourceArgs.length) throw new Error("at least one --source <directory> is required");
const sources = sourceArgs.map((value) => realpathSync(resolve(value)));
if (new Set(sources).size !== sources.length) throw new Error("duplicate --source directories are not allowed");

const outputDir = resolve(
  process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence",
);
mkdirSync(outputDir, { recursive: true });
const outputReal = realpathSync(outputDir);
if (sources.includes(outputReal)) {
  throw new Error("evidence output directory cannot also be a --source directory");
}

const sourceRunMetadata = readRunMetadata();
const categories = V3_S16_CERTIFICATION_CATEGORIES.map((category) => {
  const matches = sources
    .map((source) => ({ source, path: join(source, category.evidenceFilename) }))
    .filter((candidate) => existsSync(candidate.path));

  if (matches.length > 1) {
    throw new Error(
      `${category.evidenceFilename} appears in multiple evidence sources: ${matches.map((item) => item.source).join(", ")}`,
    );
  }
  if (matches.length === 0) {
    return {
      id: category.id,
      evidenceFilename: category.evidenceFilename,
      present: false,
      valid: false,
      source: null,
      issues: [`missing canonical evidence: ${category.evidenceFilename}`],
    };
  }

  const match = matches[0]!;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(match.path, "utf8"));
  } catch {
    value = null;
  }
  const issues = value === null
    ? [`${category.evidenceFilename} is not valid JSON`]
    : validateV3S16CategorySourceEvidence(category.id, value, candidateSha);

  if (category.id === "system-hardening" && value !== null) {
    if (sourceRunMetadata === undefined) {
      issues.push(
        "system-hardening: V3_S16_SOURCE_RUN_METADATA is required to bind declared provenance to downloaded Actions runs",
      );
    } else {
      issues.push(
        ...validateV3S16SystemHardeningSourceArtifacts(
          value,
          match.source,
          candidateSha,
          sourceRunMetadata,
        ),
      );
    }
  }

  copyFileSync(match.path, join(outputDir, category.evidenceFilename));
  return {
    id: category.id,
    evidenceFilename: category.evidenceFilename,
    present: true,
    valid: issues.length === 0,
    source: match.source,
    issues: [...new Set(issues)],
  };
});

const complete = categories.every((category) => category.present && category.valid);
const index = {
  schemaVersion: 1,
  candidateSha,
  complete,
  categoryCount: categories.length,
  validCount: categories.filter((category) => category.valid).length,
  categories,
};
const indexPath = join(outputDir, "s16-evidence-bundle-index.json");
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

process.stdout.write(
  `S16 evidence bundle: ${complete ? "COMPLETE" : "BLOCKED"} (${index.validCount}/${index.categoryCount} valid)\n`,
);
for (const category of categories) {
  process.stdout.write(`- ${category.id}: ${category.valid ? "VALID" : category.present ? "BLOCKED" : "MISSING"}\n`);
  for (const issue of category.issues) process.stdout.write(`  - ${issue}\n`);
}
process.stdout.write(`Index: ${indexPath}\n`);

if (requireComplete && !complete) process.exit(1);
