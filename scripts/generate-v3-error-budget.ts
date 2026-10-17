import { readFileSync, writeFileSync } from "node:fs";
import {
  evaluateV3OperationErrorBudget,
  type V3OperationSuccessObjective,
  type V3OperationSuccessObservation,
} from "../src/lib/v3-error-budget";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1]?.trim() || null;
}

function fail(message: string): never {
  console.error(`[v3-error-budget] ${message}`);
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

const objectivePath = argument("--objective");
const observationPath = argument("--observation");
const outputPath = argument("--output");
if (!objectivePath || !observationPath) {
  fail(
    "Usage: tsx scripts/generate-v3-error-budget.ts --objective <objective.json> --observation <observation.json> [--output <evaluation.json>]",
  );
}

const objective = readJson<V3OperationSuccessObjective>(objectivePath, "objective");
const observation = readJson<V3OperationSuccessObservation>(observationPath, "observation");
const evaluation = evaluateV3OperationErrorBudget(objective, observation);
const output = `${JSON.stringify({ generatedAt: new Date().toISOString(), evaluation }, null, 2)}\n`;

if (outputPath) writeFileSync(outputPath, output, "utf8");
else process.stdout.write(output);

if (evaluation.status === "invalid_objective" || evaluation.status === "invalid_observation") {
  process.exitCode = 2;
}
if (
  process.env.V3_ERROR_BUDGET_REQUIRE_WITHIN === "1"
  && evaluation.status !== "within_budget"
) {
  process.exitCode = 3;
}
