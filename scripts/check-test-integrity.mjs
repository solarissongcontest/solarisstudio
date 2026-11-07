import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import {
  analyzeTestIntegrity,
  TEST_INTEGRITY_EXCEPTION_HELP,
} from "./lib/test-integrity.mjs";

const TEST_FILE_RE = /(?:\.test\.|\.spec\.)(?:ts|tsx|js|jsx|mjs|cjs)$/i;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedTestFiles() {
  const explicit = process.argv.slice(2).filter(Boolean);
  if (explicit.length) return explicit.filter((file) => TEST_FILE_RE.test(file));

  const baseRef = process.env.TEST_INTEGRITY_BASE_REF?.trim();
  if (!baseRef) {
    throw new Error(
      "TEST_INTEGRITY_BASE_REF is required when no test paths are supplied. " +
        "The guard refuses to guess a comparison base.",
    );
  }

  try {
    git("cat-file", "-e", `${baseRef}^{commit}`);
  } catch {
    throw new Error(
      `Cannot resolve test-integrity base commit ${baseRef}. Fetch the exact base SHA before running the guard.`,
    );
  }

  const output = git(
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    `${baseRef}...HEAD`,
  );
  return output
    .split("\n")
    .map((file) => file.trim())
    .filter((file) => file && TEST_FILE_RE.test(file));
}

let testFiles;
try {
  testFiles = changedTestFiles();
} catch (error) {
  console.error(`Test-integrity guard could not establish its comparison scope: ${error.message}`);
  process.exit(1);
}

const findings = [];
for (const filePath of testFiles) {
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Test-integrity guard could not read ${filePath}: ${error.message}`);
    process.exit(1);
  }

  const finding = analyzeTestIntegrity(filePath, source);
  if (finding.flagged) findings.push(finding);
}

if (findings.length) {
  console.error("Test-integrity guard found suspicious production-source lock-in:");
  for (const finding of findings) {
    console.error(`\n- ${finding.filePath}`);
    console.error(
      `  production source: ${finding.productionReads.length ? finding.productionReads.join(", ") : "not resolved (invalid exception marker)"}`,
    );
    console.error(`  raw source assertions: ${finding.rawAssertionCount}`);
    for (const reason of finding.reasons) console.error(`  reason: ${reason}`);
  }
  console.error(
    "\nPrefer testing exported behavior, rendered output, structured config, or a machine-readable policy module.",
  );
  console.error(
    "For a genuine architecture/security/migration/CI/release static contract, classify it explicitly with:",
  );
  console.error(`  ${TEST_INTEGRITY_EXCEPTION_HELP}`);
  process.exit(1);
}

console.log(`Test-integrity guard passed for ${testFiles.length} changed test file(s).`);
