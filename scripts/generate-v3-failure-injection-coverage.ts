import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildV3FailureInjectionCoverageReport,
  validateV3FailureInjectionCoverage,
} from "../src/lib/v3-failure-injection-coverage";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[v3-failure-coverage] ${name} is required`);
    process.exit(2);
  }
  return value;
}

const commitSha = requiredEnvironment("V3_FAILURE_COVERAGE_SHA").toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  console.error("[v3-failure-coverage] V3_FAILURE_COVERAGE_SHA must be an exact 40-character commit SHA");
  process.exit(2);
}

let checkoutSha: string;
let worktreeState: string;
try {
  checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  worktreeState = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  );
} catch (error) {
  console.error(`[v3-failure-coverage] could not inspect checked-out commit: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
if (checkoutSha !== commitSha) {
  console.error(
    `[v3-failure-coverage] evidence SHA ${commitSha} does not match checked-out commit ${checkoutSha}`,
  );
  process.exit(2);
}
if (worktreeState.trim()) {
  console.error(
    "[v3-failure-coverage] exact-SHA evidence requires a clean worktree, including no untracked files",
  );
  process.exit(2);
}

const environment = requiredEnvironment("V3_FAILURE_COVERAGE_ENVIRONMENT");
if (environment.length > 120) {
  console.error("[v3-failure-coverage] V3_FAILURE_COVERAGE_ENVIRONMENT must be at most 120 characters");
  process.exit(2);
}

const validationErrors = validateV3FailureInjectionCoverage();
if (validationErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, validationErrors }, null, 2));
  process.exit(1);
}

const report = buildV3FailureInjectionCoverageReport();
const output = `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  evidenceIdentity: {
    commitSha,
    environment,
    command: "npx tsx scripts/generate-v3-failure-injection-coverage.ts",
  },
  report,
}, null, 2)}\n`;

const outputPath = process.env.V3_FAILURE_COVERAGE_OUTPUT?.trim();
if (outputPath) {
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, output, "utf8");
} else {
  process.stdout.write(output);
}

if (
  process.env.V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED === "1"
  && report.unresolved.length > 0
) {
  process.exitCode = 3;
}
