import { readFileSync, writeFileSync } from "node:fs";
import {
  evaluateV3CapacityEvidence,
  type V3CapacityBudgetPlan,
} from "../src/lib/v3-capacity-evidence";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1]?.trim() || null;
}

function fail(message: string): never {
  console.error(`[v3-capacity-evidence] ${message}`);
  process.exit(2);
}

function readJson<T>(path: string, label: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Could not read ${label} ${path}: ${detail}`);
  }
}

const planPath = argument("--plan");
const reportPath = argument("--report");
const outputPath = argument("--output");
if (!planPath || !reportPath) {
  fail(
    "Usage: tsx scripts/evaluate-v3-capacity-evidence.ts --plan <budget-plan.json> --report <capacity-report.json> [--output <evaluation.json>]",
  );
}

const plan = readJson<V3CapacityBudgetPlan>(planPath, "capacity budget plan");
const report = readJson<unknown>(reportPath, "capacity report");
const evaluation = evaluateV3CapacityEvidence(plan, report);
const output = `${JSON.stringify({ generatedAt: new Date().toISOString(), evaluation }, null, 2)}\n`;

if (outputPath) writeFileSync(outputPath, output, "utf8");
else process.stdout.write(output);

if (evaluation.status === "invalid") process.exitCode = 2;
if (
  process.env.V3_CAPACITY_REQUIRE_COMPARISON_READY === "1"
  && !evaluation.comparisonReady
) {
  process.exitCode = 3;
}
