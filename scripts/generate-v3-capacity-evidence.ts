import { readFileSync, writeFileSync } from "node:fs";
import { assessV3CapacityEvidence } from "../src/lib/v3-capacity-evidence";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1]?.trim();
  return value || null;
}

function fail(message: string): never {
  console.error(`[v3-capacity-evidence] ${message}`);
  process.exit(2);
}

function readJson(path: string, label: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Could not read ${label} ${path}: ${detail}`);
  }
}

const reportPath = argument("--report");
const contextPath = argument("--context");
const outputPath = argument("--output");

if (!reportPath || !contextPath) {
  fail(
    "Usage: tsx scripts/generate-v3-capacity-evidence.ts --report <local-report.json> --context <evidence-context.json> [--output <assessment.json>]",
  );
}

const report = readJson(reportPath, "capacity report");
const context = readJson(contextPath, "capacity evidence context");
const assessment = assessV3CapacityEvidence(report, context);
const output = `${JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    assessment,
  },
  null,
  2,
)}\n`;

if (outputPath) writeFileSync(outputPath, output, "utf8");
else process.stdout.write(output);

if (assessment.status === "invalid") process.exitCode = 2;
if (
  process.env.V3_CAPACITY_REQUIRE_REVIEW_READY === "1" &&
  assessment.status !== "ready_for_qa_review"
) {
  process.exitCode = 3;
}
